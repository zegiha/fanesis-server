import type { PrismaClient } from '@/generated/prisma/client';
import { Language } from '@/generated/prisma/client';
import { createTestPrisma, truncateAll } from '../../../test/setup/prisma-test';

describe('tasks (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser() {
    return prisma.users.create({
      data: { language: Language.ko, timezone: 'Asia/Seoul' },
    });
  }

  it('rejects active=big3 task without scheduledDate (big3_requires_date CHECK)', async () => {
    const user = await createUser();
    await expect(
      prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'X',
          backlogKind: 'inbox',
          activeKind: 'big3',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects backlogKind=folder without backlog_folder_id (backlog_folder_consistency)', async () => {
    const user = await createUser();
    await expect(
      prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'X',
          backlogKind: 'folder',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects backlogKind=inbox with backlog_folder_id set', async () => {
    const user = await createUser();
    const folder = await prisma.folders.create({
      data: { userUuid: user.uuid, name: 'work', color: 'blue' },
    });
    await expect(
      prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'X',
          backlogKind: 'inbox',
          backlogFolderId: folder.uuid,
        },
      }),
    ).rejects.toThrow();
  });

  it('resets tasks to inbox when their folder is deleted (trigger)', async () => {
    const user = await createUser();
    const folder = await prisma.folders.create({
      data: { userUuid: user.uuid, name: 'work', color: 'blue' },
    });
    const task = await prisma.tasks.create({
      data: {
        userUuid: user.uuid,
        title: 'X',
        backlogKind: 'folder',
        backlogFolderId: folder.uuid,
      },
    });

    await prisma.folders.delete({ where: { uuid: folder.uuid } });

    const refreshed = await prisma.tasks.findUnique({
      where: { uuid: task.uuid },
    });
    expect(refreshed?.backlogKind).toBe('inbox');
    expect(refreshed?.backlogFolderId).toBeNull();
  });

  it('rejects duplicate folder name (case-insensitive) per user', async () => {
    const user = await createUser();
    await prisma.folders.create({
      data: { userUuid: user.uuid, name: 'Work', color: 'red' },
    });
    await expect(
      prisma.folders.create({
        data: { userUuid: user.uuid, name: 'work', color: 'blue' },
      }),
    ).rejects.toThrow();
  });

  it('rejects 4th big3 task on the same date (trigger)', async () => {
    const user = await createUser();
    const date = new Date('2026-05-17');
    for (let i = 0; i < 3; i++) {
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: `big3-${i}`,
          backlogKind: 'inbox',
          activeKind: 'big3',
          scheduledDate: date,
        },
      });
    }
    await expect(
      prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'fourth',
          backlogKind: 'inbox',
          activeKind: 'big3',
          scheduledDate: date,
        },
      }),
    ).rejects.toThrow();
  });

  it('allows up to 3 big3 tasks per date and across different dates independently', async () => {
    const user = await createUser();
    for (let i = 0; i < 3; i++) {
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: `d1-${i}`,
          backlogKind: 'inbox',
          activeKind: 'big3',
          scheduledDate: new Date('2026-05-17'),
        },
      });
    }
    // 다른 날짜는 별도 카운트
    const otherDay = await prisma.tasks.create({
      data: {
        userUuid: user.uuid,
        title: 'd2-1',
        backlogKind: 'inbox',
        activeKind: 'big3',
        scheduledDate: new Date('2026-05-18'),
      },
    });
    expect(otherDay.uuid).toBeDefined();
  });

  it('rejects chunk_sec > duration_sec', async () => {
    const user = await createUser();
    await expect(
      prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'X',
          backlogKind: 'inbox',
          durationSec: 100,
          chunkSec: 200,
        },
      }),
    ).rejects.toThrow();
  });
});
