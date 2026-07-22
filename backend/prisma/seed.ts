import { PrismaClient, type SystemRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';

const prisma = new PrismaClient();
const code = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

// Shared demo password for every sample account.
const DEMO_PASSWORD = 'Password123!';

const SAMPLE_USERS: Array<{ email: string; name: string; role: SystemRole }> = [
  { email: 'admin@planningpoker.dev', name: 'Ada Admin', role: 'ADMIN' },
  { email: 'scrum@planningpoker.dev', name: 'Sam ScrumMaster', role: 'SCRUM_MASTER' },
  { email: 'dev1@planningpoker.dev', name: 'Dana Developer', role: 'DEVELOPER' },
  { email: 'dev2@planningpoker.dev', name: 'Devon Coder', role: 'DEVELOPER' },
  { email: 'dev3@planningpoker.dev', name: 'Priya Programmer', role: 'DEVELOPER' },
  { email: 'observer@planningpoker.dev', name: 'Oscar Observer', role: 'OBSERVER' },
];

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const users = await Promise.all(
    SAMPLE_USERS.map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: {
          email: u.email,
          name: u.name,
          role: u.role,
          passwordHash,
          avatarUrl: `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(u.name)}`,
        },
      }),
    ),
  );

  const admin = users[0];
  const scrumMaster = users[1];
  const developers = users.slice(2, 5);

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'acme-agile' },
    update: {},
    create: {
      name: 'Acme Agile',
      slug: 'acme-agile',
      description: 'Demo workspace for Planning Poker',
      ownerId: admin.id,
      members: {
        create: users.map((u) => ({ userId: u.id, role: u.role })),
      },
    },
  });

  const project = await prisma.project.upsert({
    where: { workspaceId_key: { workspaceId: workspace.id, key: 'PP' } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'Planning Poker Platform',
      key: 'PP',
      description: 'The estimation platform itself',
      jiraProjectKey: 'PP',
    },
  });

  const sprint = await prisma.sprint.create({
    data: {
      projectId: project.id,
      name: 'Sprint 24',
      goal: 'Ship real-time estimation MVP',
      startDate: new Date('2026-07-20'),
      endDate: new Date('2026-08-03'),
    },
  });

  const session = await prisma.session.create({
    data: {
      code: code(),
      projectId: project.id,
      sprintId: sprint.id,
      createdById: scrumMaster.id,
      sprintName: 'Sprint 24',
      sprintGoal: 'Ship real-time estimation MVP',
      estimateScale: 'FIBONACCI',
      status: 'ACTIVE',
      participants: {
        create: [
          { userId: scrumMaster.id, role: 'SCRUM_MASTER', isOnline: true },
          ...developers.map((d) => ({ userId: d.id, role: 'DEVELOPER' as const, isOnline: true })),
          { userId: users[5].id, role: 'OBSERVER' as const },
        ],
      },
      stories: {
        create: [
          {
            jiraStoryId: 'PP-101',
            title: 'Anonymous voting with reveal',
            description:
              'As a Scrum team we want to vote anonymously and only reveal on the Scrum Master action so estimates are unbiased.',
            acceptanceCriteria:
              '1. Votes hidden until reveal\n2. Members can change votes before reveal\n3. Reveal shows name, avatar and card',
            labels: ['core', 'realtime'],
            priority: 'HIGH',
            type: 'STORY',
            order: 0,
          },
          {
            jiraStoryId: 'PP-102',
            title: 'Statistics & analytics after reveal',
            description: 'Show average, median, mode, consensus and charts once votes are revealed.',
            acceptanceCriteria: '1. Average/median/mode\n2. Consensus meter\n3. Distribution chart',
            labels: ['analytics'],
            priority: 'MEDIUM',
            type: 'STORY',
            order: 1,
          },
          {
            jiraStoryId: 'PP-103',
            title: 'Migrate legacy auth to Azure AD SSO',
            description:
              'Integrate Microsoft Entra ID. Security-sensitive migration with dependencies on the identity team.',
            acceptanceCriteria: '1. Azure AD login\n2. Token refresh\n3. Role mapping',
            risks: 'Security migration, breaking change to existing sessions',
            dependencies: 'Depends on identity team provisioning the app registration',
            labels: ['auth', 'security'],
            priority: 'HIGHEST',
            type: 'SPIKE',
            order: 2,
          },
        ],
      },
    },
    include: { stories: true },
  });

  // Seed a completed round with votes on the first story to demo analytics.
  const firstStory = session.stories[0];
  const round = await prisma.round.create({
    data: { storyId: firstStory.id, roundNumber: 1, status: 'REVEALED', revealedAt: new Date() },
  });
  const demoVotes = ['5', '5', '8', '5'];
  const voters = [scrumMaster, ...developers];
  await prisma.vote.createMany({
    data: voters.slice(0, demoVotes.length).map((u, i) => ({
      roundId: round.id,
      userId: u.id,
      value: demoVotes[i],
    })),
  });

  console.log('✅ Seed complete.');
  console.log('\n👤 Sample accounts (password for all): ' + DEMO_PASSWORD);
  SAMPLE_USERS.forEach((u) => console.log(`   - ${u.role.padEnd(13)} ${u.email}`));
  console.log(`\n🃏 Demo session join code: ${session.code}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
