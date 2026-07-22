import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectSocket, getSocket, SocketEvents } from '@/services/socket';
import { pokerApi } from '@/services/pokerApi';
import { useAppSelector } from '@/store';
import type {
  Participant,
  RevealResult,
  RoundPresence,
  Session,
  Story,
  StoryRoundState,
} from '@/types';

interface PresenceMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  isOnline: boolean;
}

/**
 * Encapsulates all realtime state for a session room: socket lifecycle,
 * presence, the active round for the selected story, votes and results.
 *
 * The socket is the primary transport; REST is used for the initial hydrate and
 * for actions that must be authorised server-side (start/reveal/lock).
 */
export function useSessionRoom(code: string) {
  const currentUser = useAppSelector((s) => s.auth.user);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [roundState, setRoundState] = useState<StoryRoundState>({ round: null, presence: null, results: null });
  const [myVote, setMyVote] = useState<string | null>(null);
  const [presenceOverride, setPresenceOverride] = useState<PresenceMember[] | null>(null);

  const selectedStoryRef = useRef<string | null>(null);
  selectedStoryRef.current = selectedStoryId;

  // ---- initial load ----
  const hydrate = useCallback(async () => {
    try {
      const data = await pokerApi.getSessionByCode(code);
      setSession(data);
      setSelectedStoryId((prev) => prev ?? data.stories[0]?.id ?? null);
      setError(null);
    } catch {
      setError('Session not found or you do not have access.');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // ---- load round state whenever the selected story changes ----
  useEffect(() => {
    if (!selectedStoryId) return;
    let cancelled = false;
    pokerApi
      .getStoryRound(selectedStoryId)
      .then((state) => {
        if (cancelled) return;
        setRoundState(state);
        // reflect my own vote (we can't see the value pre-reveal, only presence)
        if (state.results) {
          const mine = state.results.votes.find((v) => v.userId === currentUser?.id);
          setMyVote(mine?.value ?? null);
        } else {
          setMyVote(null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedStoryId, currentUser?.id]);

  // ---- socket wiring ----
  useEffect(() => {
    const socket = connectSocket();

    const onConnect = () => {
      setConnected(true);
      socket.emit(SocketEvents.JOIN_SESSION, { sessionCode: code });
    };
    const onDisconnect = () => setConnected(false);

    const onPresence = (payload: { participants: PresenceMember[] }) => setPresenceOverride(payload.participants);

    const onVoteSubmitted = (payload: { userId: string; presence: RoundPresence }) => {
      setRoundState((prev) =>
        prev.round && prev.round.id === payload.presence.roundId ? { ...prev, presence: payload.presence } : prev,
      );
    };

    const onRoundStarted = (payload: { storyId: string; round: StoryRoundState['round'] }) => {
      if (payload.storyId === selectedStoryRef.current) {
        setRoundState({ round: payload.round, presence: null, results: null });
        setMyVote(null);
        // fetch fresh presence for the new round
        if (payload.round) void pokerApi.getPresence(payload.round.id).then((p) => setRoundState((s) => ({ ...s, presence: p })));
      }
      void hydrate();
    };

    const onRevealed = (payload: RevealResult) => {
      setRoundState((prev) =>
        prev.round && prev.round.id === payload.roundId
          ? { ...prev, results: payload, round: { ...prev.round, status: 'REVEALED' } }
          : prev,
      );
      const mine = payload.votes.find((v) => v.userId === currentUser?.id);
      if (mine) setMyVote(mine.value);
    };

    const onStoryLocked = (payload: { story: Story }) => {
      setSession((prev) =>
        prev
          ? { ...prev, stories: prev.stories.map((s) => (s.id === payload.story.id ? { ...s, ...payload.story } : s)) }
          : prev,
      );
    };

    const onSessionUpdated = () => void hydrate();

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(SocketEvents.PRESENCE_UPDATE, onPresence);
    socket.on(SocketEvents.USER_JOINED, onSessionUpdated);
    socket.on(SocketEvents.VOTE_SUBMITTED, onVoteSubmitted);
    socket.on(SocketEvents.ROUND_STARTED, onRoundStarted);
    socket.on(SocketEvents.VOTES_REVEALED, onRevealed);
    socket.on(SocketEvents.STORY_LOCKED, onStoryLocked);
    socket.on(SocketEvents.SESSION_UPDATED, onSessionUpdated);

    if (socket.connected) onConnect();

    return () => {
      socket.emit(SocketEvents.LEAVE_SESSION, { sessionCode: code });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(SocketEvents.PRESENCE_UPDATE, onPresence);
      socket.off(SocketEvents.USER_JOINED, onSessionUpdated);
      socket.off(SocketEvents.VOTE_SUBMITTED, onVoteSubmitted);
      socket.off(SocketEvents.ROUND_STARTED, onRoundStarted);
      socket.off(SocketEvents.VOTES_REVEALED, onRevealed);
      socket.off(SocketEvents.STORY_LOCKED, onStoryLocked);
      socket.off(SocketEvents.SESSION_UPDATED, onSessionUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, currentUser?.id, hydrate]);

  // ---- derived ----
  const selectedStory = useMemo(
    () => session?.stories.find((s) => s.id === selectedStoryId) ?? null,
    [session, selectedStoryId],
  );

  const myParticipant = useMemo(
    () => session?.participants.find((p) => p.userId === currentUser?.id),
    [session, currentUser?.id],
  );
  const isScrumMaster = myParticipant?.role === 'SCRUM_MASTER' || currentUser?.role === 'ADMIN';
  const isObserver = myParticipant?.role === 'OBSERVER' || currentUser?.role === 'OBSERVER';

  // Merge live presence over the persisted participant list.
  const participants: PresenceMember[] = useMemo(() => {
    const base: PresenceMember[] =
      session?.participants.map((p: Participant) => ({
        userId: p.userId,
        name: p.user.name,
        avatarUrl: p.user.avatarUrl,
        role: p.role,
        isOnline: p.isOnline,
      })) ?? [];
    if (!presenceOverride) return base;
    const map = new Map(base.map((b) => [b.userId, b]));
    for (const o of presenceOverride) map.set(o.userId, o);
    return [...map.values()];
  }, [session, presenceOverride]);

  // ---- actions ----
  const castVote = useCallback(
    (value: string) => {
      if (!roundState.round || roundState.round.status !== 'OPEN') return;
      setMyVote(value);
      getSocket().emit(SocketEvents.VOTE_CAST, { roundId: roundState.round.id, value });
    },
    [roundState.round],
  );

  const startRound = useCallback(async () => {
    if (!selectedStoryId) return;
    await pokerApi.startRound(selectedStoryId);
  }, [selectedStoryId]);

  const reveal = useCallback(async () => {
    if (!roundState.round) return;
    await pokerApi.reveal(roundState.round.id);
  }, [roundState.round]);

  const lockStory = useCallback(
    async (finalEstimate: string) => {
      if (!selectedStoryId) return;
      await pokerApi.lockStory(selectedStoryId, finalEstimate);
    },
    [selectedStoryId],
  );

  return {
    session,
    loading,
    error,
    connected,
    selectedStory,
    selectStory: setSelectedStoryId,
    round: roundState.round,
    presence: roundState.presence,
    results: roundState.results,
    myVote,
    castVote,
    participants,
    isScrumMaster,
    isObserver,
    startRound,
    reveal,
    lockStory,
    refresh: hydrate,
  };
}
