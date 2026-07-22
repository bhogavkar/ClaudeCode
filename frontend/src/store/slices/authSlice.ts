import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import api, { setAccessToken } from '@/services/api';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error';
  error: string | null;
  initialized: boolean;
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
  error: null,
  initialized: false,
};

export const login = createAsyncThunk(
  'auth/login',
  async (payload: { email: string; password: string }) => {
    const { data } = await api.post<{ user: User; accessToken: string }>('/auth/login', payload);
    setAccessToken(data.accessToken);
    return data.user;
  },
);

export const register = createAsyncThunk(
  'auth/register',
  async (payload: { name: string; email: string; password: string; role?: string }) => {
    const { data } = await api.post<{ user: User; accessToken: string }>('/auth/register', payload);
    setAccessToken(data.accessToken);
    return data.user;
  },
);

/** Restore a session on app load using the refresh cookie. */
export const bootstrapAuth = createAsyncThunk('auth/bootstrap', async () => {
  const refresh = await api.post<{ accessToken: string }>('/auth/refresh', {});
  setAccessToken(refresh.data.accessToken);
  const me = await api.get<{ user: User }>('/auth/me');
  return me.data.user;
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await api.post('/auth/logout', {}).catch(() => undefined);
  setAccessToken(null);
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    sessionExpired(state) {
      state.user = null;
      state.status = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapAuth.fulfilled, (state, action: PayloadAction<User>) => {
        state.user = action.payload;
        state.status = 'authenticated';
        state.initialized = true;
      })
      .addCase(bootstrapAuth.rejected, (state) => {
        state.initialized = true;
        state.status = 'idle';
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.status = 'idle';
      });

    for (const thunk of [login, register]) {
      builder
        .addCase(thunk.pending, (state) => {
          state.status = 'loading';
          state.error = null;
        })
        .addCase(thunk.fulfilled, (state, action) => {
          state.user = action.payload as User;
          state.status = 'authenticated';
        })
        .addCase(thunk.rejected, (state, action) => {
          state.status = 'error';
          state.error =
            (action.error.message?.includes('401')
              ? 'Invalid email or password'
              : action.error.message) ?? 'Authentication failed';
        });
    }
  },
});

export const { clearError, sessionExpired } = authSlice.actions;
export default authSlice.reducer;
