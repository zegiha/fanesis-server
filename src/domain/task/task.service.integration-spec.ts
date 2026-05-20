import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient } from '@/generated/prisma/client';
import { Language } from '@/generated/prisma/client';
import { PrismaService } from '@/core/prisma/prisma.service';
import { createTestPrisma, truncateAll } from '../../../test/setup/prisma-test';
import { TaskService } from './task.service';
import { FolderNotFoundException } from './task.exceptions';

describe('tasks (integration)', () => {
  let prisma: PrismaClient;
  let service: TaskService;

  beforeAll(() => {
    prisma = createTestPrisma();
    service = new TaskService(
      prisma as unknown as PrismaService,
      new EventEmitter2(),
    );
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

  it('forbids raw delete of a folder that still has tasks attached (CHECK safety net)', async () => {
    const user = await createUser();
    const folder = await prisma.folders.create({
      data: { userUuid: user.uuid, name: 'work', color: 'blue' },
    });
    await prisma.tasks.create({
      data: {
        userUuid: user.uuid,
        title: 'X',
        backlogKind: 'folder',
        backlogFolderId: folder.uuid,
      },
    });

    // trigger 제거 후, FK ON DELETE SET NULL이 backlog_folder_id를 NULL로 만들지만
    // backlog_kind='folder'는 그대로라 backlog_folder_consistency CHECK가 막아준다.
    await expect(
      prisma.folders.delete({ where: { uuid: folder.uuid } }),
    ).rejects.toThrow();
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

  describe('list endpoints', () => {
    it('findInbox returns only inbox + incomplete and paginates', async () => {
      const user = await createUser();
      const folder = await prisma.folders.create({
        data: { userUuid: user.uuid, name: 'work', color: 'blue' },
      });
      // 25 inbox tasks
      for (let i = 0; i < 25; i++) {
        await prisma.tasks.create({
          data: {
            userUuid: user.uuid,
            title: `inbox-${i}`,
            backlogKind: 'inbox',
          },
        });
      }
      // folder task (should be excluded)
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'folder-task',
          backlogKind: 'folder',
          backlogFolderId: folder.uuid,
        },
      });
      // done inbox task (should be excluded by doneDate filter)
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'done-inbox',
          backlogKind: 'inbox',
          doneDate: new Date(),
        },
      });

      const page1 = await service.findInbox(user.uuid, 1, 20);
      expect(page1.total).toBe(25);
      expect(page1.items).toHaveLength(20);

      const page2 = await service.findInbox(user.uuid, 2, 20);
      expect(page2.items).toHaveLength(5);
    });

    it('findByFolder returns only that folder + incomplete', async () => {
      const user = await createUser();
      const folder = await prisma.folders.create({
        data: { userUuid: user.uuid, name: 'work', color: 'blue' },
      });
      const otherFolder = await prisma.folders.create({
        data: { userUuid: user.uuid, name: 'other', color: 'red' },
      });
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'in-folder',
          backlogKind: 'folder',
          backlogFolderId: folder.uuid,
        },
      });
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'in-folder-done',
          backlogKind: 'folder',
          backlogFolderId: folder.uuid,
          doneDate: new Date(),
        },
      });
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'in-other',
          backlogKind: 'folder',
          backlogFolderId: otherFolder.uuid,
        },
      });

      const result = await service.findByFolder(user.uuid, folder.uuid);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('in-folder');
    });

    it('findByFolder throws FolderNotFoundException for a folder owned by another user', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const folder = await prisma.folders.create({
        data: { userUuid: owner.uuid, name: 'work', color: 'blue' },
      });
      await expect(
        service.findByFolder(stranger.uuid, folder.uuid),
      ).rejects.toBeInstanceOf(FolderNotFoundException);
    });

    it('findByDate includes completed tasks for that date and excludes other dates', async () => {
      const user = await createUser();
      const target = new Date('2026-05-20');
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'scheduled-active',
          backlogKind: 'inbox',
          scheduledDate: target,
        },
      });
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'scheduled-done',
          backlogKind: 'inbox',
          scheduledDate: target,
          doneDate: new Date('2026-05-20T12:00:00Z'),
        },
      });
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'other-date',
          backlogKind: 'inbox',
          scheduledDate: new Date('2026-05-21'),
        },
      });

      const result = await service.findByDate(user.uuid, '2026-05-20');
      const titles = result.map((t) => t.title).sort();
      expect(titles).toEqual(['scheduled-active', 'scheduled-done']);
    });

    it('findDone returns only completed tasks ordered by doneDate desc', async () => {
      const user = await createUser();
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'not-done',
          backlogKind: 'inbox',
        },
      });
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'done-older',
          backlogKind: 'inbox',
          doneDate: new Date('2026-05-19T10:00:00Z'),
        },
      });
      await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: 'done-newer',
          backlogKind: 'inbox',
          doneDate: new Date('2026-05-20T10:00:00Z'),
        },
      });

      const result = await service.findDone(user.uuid, 1, 20);
      expect(result.total).toBe(2);
      expect(result.items.map((t) => t.title)).toEqual([
        'done-newer',
        'done-older',
      ]);
    });

    it('isolates list endpoints per user (no cross-user leakage)', async () => {
      const me = await createUser();
      const other = await createUser();
      await prisma.tasks.create({
        data: { userUuid: me.uuid, title: 'mine', backlogKind: 'inbox' },
      });
      await prisma.tasks.create({
        data: { userUuid: other.uuid, title: 'theirs', backlogKind: 'inbox' },
      });

      const inbox = await service.findInbox(me.uuid, 1, 20);
      expect(inbox.total).toBe(1);
      expect(inbox.items[0].title).toBe('mine');
    });
  });
});
