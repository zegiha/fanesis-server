import { Test } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import type { PrismaClient, Tasks, Users } from '@/generated/prisma/client';
import { Language } from '@/generated/prisma/client';
import { createTestPrisma, truncateAll } from '../../../test/setup/prisma-test';
import { FocusSessionKindDto } from './dto/start-focus-session.dto';
import {
  FocusSessionAlreadyActiveException,
  FocusSessionAlreadyEndedException,
  FocusSessionNotFoundException,
} from './focus.exceptions';
import { FocusService } from './focus.service';

describe('focus-sessions (integration)', () => {
  let prisma: PrismaClient;
  let service: FocusService;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const module = await Test.createTestingModule({
      providers: [FocusService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(FocusService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser(timezone = 'Asia/Seoul'): Promise<Users> {
    return prisma.users.create({
      data: { language: Language.ko, timezone },
    });
  }

  async function createTask(userUuid: string): Promise<Tasks> {
    return prisma.tasks.create({
      data: { userUuid, title: 'task', backlogKind: 'inbox' },
    });
  }

  describe('partial unique idx_focus_sessions_user_active', () => {
    it('service.start twice for the same user → AlreadyActive', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      await service.start(user.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: task.uuid,
      });
      await expect(
        service.start(user.uuid, {
          kind: FocusSessionKindDto.break,
          taskUuid: task.uuid,
        }),
      ).rejects.toBeInstanceOf(FocusSessionAlreadyActiveException);
    });

    it('raw insert of a second active session is rejected by DB', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      await prisma.focusSessions.create({
        data: {
          userUuid: user.uuid,
          kind: 'focus',
          taskUuid: task.uuid,
          startedAt: new Date(),
        },
      });
      await expect(
        prisma.focusSessions.create({
          data: {
            userUuid: user.uuid,
            kind: 'focus',
            taskUuid: task.uuid,
            startedAt: new Date(),
          },
        }),
      ).rejects.toThrow();
    });

    it('allows a new session after the previous one is ended', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      const first = await service.start(user.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: task.uuid,
      });
      await service.end(user.uuid, first.uuid);

      const second = await service.start(user.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: task.uuid,
      });
      expect(second.uuid).not.toBe(first.uuid);
      expect(second.endedAt).toBeNull();
    });

    it('allows a new session after the active one is hard-deleted (recovery flow)', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      const first = await service.start(user.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: task.uuid,
      });
      await service.remove(user.uuid, first.uuid);

      const second = await service.start(user.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: task.uuid,
      });
      expect(second.uuid).not.toBe(first.uuid);
    });
  });

  describe('CHECK focus_time_order', () => {
    it('rejects raw insert with ended_at < started_at', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      await expect(
        prisma.focusSessions.create({
          data: {
            userUuid: user.uuid,
            kind: 'focus',
            taskUuid: task.uuid,
            startedAt: new Date('2026-05-20T10:00:00Z'),
            endedAt: new Date('2026-05-20T09:00:00Z'),
          },
        }),
      ).rejects.toThrow();
    });

    it('allows ended_at equal to started_at', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      const at = new Date('2026-05-20T10:00:00Z');
      const row = await prisma.focusSessions.create({
        data: {
          userUuid: user.uuid,
          kind: 'focus',
          taskUuid: task.uuid,
          startedAt: at,
          endedAt: at,
        },
      });
      expect(row.uuid).toBeDefined();
    });
  });

  describe('FK cascade behavior', () => {
    it('ON DELETE SET NULL on task: session survives with taskUuid=null', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      const session = await service.start(user.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: task.uuid,
      });
      await prisma.tasks.delete({ where: { uuid: task.uuid } });

      const after = await prisma.focusSessions.findUnique({
        where: { uuid: session.uuid },
      });
      expect(after).not.toBeNull();
      expect(after?.taskUuid).toBeNull();
    });

    it('ON DELETE CASCADE on user: sessions are removed', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      const session = await service.start(user.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: task.uuid,
      });
      await prisma.users.delete({ where: { uuid: user.uuid } });

      const after = await prisma.focusSessions.findUnique({
        where: { uuid: session.uuid },
      });
      expect(after).toBeNull();
    });
  });

  describe('getActive', () => {
    it('returns the active session when present', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      const session = await service.start(user.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: task.uuid,
      });
      const active = await service.getActive(user.uuid);
      expect(active?.uuid).toBe(session.uuid);
    });

    it('returns null when nothing active', async () => {
      const user = await createUser();
      const active = await service.getActive(user.uuid);
      expect(active).toBeNull();
    });

    it('ignores ended sessions and other users active sessions', async () => {
      const a = await createUser();
      const b = await createUser();
      const taskA = await createTask(a.uuid);
      const taskB = await createTask(b.uuid);
      const aSession = await service.start(a.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: taskA.uuid,
      });
      await service.end(a.uuid, aSession.uuid);
      const bSession = await service.start(b.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: taskB.uuid,
      });

      expect(await service.getActive(a.uuid)).toBeNull();
      expect((await service.getActive(b.uuid))?.uuid).toBe(bSession.uuid);
    });
  });

  describe('findByDate (Asia/Seoul bucketing)', () => {
    it('puts 2026-05-20 15:00 UTC into 2026-05-21 (KST), not 2026-05-20', async () => {
      const user = await createUser('Asia/Seoul');
      const task = await createTask(user.uuid);
      // 2026-05-20 15:00 UTC == 2026-05-21 00:00 KST
      await prisma.focusSessions.create({
        data: {
          userUuid: user.uuid,
          kind: 'focus',
          taskUuid: task.uuid,
          startedAt: new Date('2026-05-20T15:00:00Z'),
          endedAt: new Date('2026-05-20T16:00:00Z'),
        },
      });

      const on20 = await service.findByDate(user.uuid, '2026-05-20');
      expect(on20).toHaveLength(0);

      const on21 = await service.findByDate(user.uuid, '2026-05-21');
      expect(on21).toHaveLength(1);
    });

    it('orders by startedAt DESC', async () => {
      const user = await createUser('Asia/Seoul');
      const task = await createTask(user.uuid);
      // Both inside 2026-05-20 KST: KST 03:00 = UTC 18:00 of 05-19, KST 23:00 = UTC 14:00 of 05-20
      await prisma.focusSessions.create({
        data: {
          userUuid: user.uuid,
          kind: 'focus',
          taskUuid: task.uuid,
          startedAt: new Date('2026-05-19T18:00:00Z'),
          endedAt: new Date('2026-05-19T19:00:00Z'),
        },
      });
      await prisma.focusSessions.create({
        data: {
          userUuid: user.uuid,
          kind: 'break',
          taskUuid: task.uuid,
          startedAt: new Date('2026-05-20T14:00:00Z'),
          endedAt: new Date('2026-05-20T14:30:00Z'),
        },
      });

      const sessions = await service.findByDate(user.uuid, '2026-05-20');
      expect(sessions).toHaveLength(2);
      expect(sessions[0].startedAt.getTime()).toBeGreaterThan(
        sessions[1].startedAt.getTime(),
      );
    });

    it('scopes by user', async () => {
      const a = await createUser('Asia/Seoul');
      const b = await createUser('Asia/Seoul');
      const taskA = await createTask(a.uuid);
      const taskB = await createTask(b.uuid);
      await prisma.focusSessions.create({
        data: {
          userUuid: a.uuid,
          kind: 'focus',
          taskUuid: taskA.uuid,
          startedAt: new Date('2026-05-20T03:00:00Z'),
          endedAt: new Date('2026-05-20T03:30:00Z'),
        },
      });
      await prisma.focusSessions.create({
        data: {
          userUuid: b.uuid,
          kind: 'focus',
          taskUuid: taskB.uuid,
          startedAt: new Date('2026-05-20T03:00:00Z'),
          endedAt: new Date('2026-05-20T03:30:00Z'),
        },
      });

      const aOn20 = await service.findByDate(a.uuid, '2026-05-20');
      expect(aOn20).toHaveLength(1);
      expect(aOn20[0].userUuid).toBe(a.uuid);
    });
  });

  describe('end / remove cross-user safety', () => {
    it('end throws NotFound when called by another user', async () => {
      const a = await createUser();
      const b = await createUser();
      const taskA = await createTask(a.uuid);
      const session = await service.start(a.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: taskA.uuid,
      });
      await expect(service.end(b.uuid, session.uuid)).rejects.toBeInstanceOf(
        FocusSessionNotFoundException,
      );
    });

    it('end then end again → AlreadyEnded', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      const session = await service.start(user.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: task.uuid,
      });
      await service.end(user.uuid, session.uuid);
      await expect(service.end(user.uuid, session.uuid)).rejects.toBeInstanceOf(
        FocusSessionAlreadyEndedException,
      );
    });

    it('remove throws NotFound when called by another user', async () => {
      const a = await createUser();
      const b = await createUser();
      const taskA = await createTask(a.uuid);
      const session = await service.start(a.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: taskA.uuid,
      });
      await expect(service.remove(b.uuid, session.uuid)).rejects.toBeInstanceOf(
        FocusSessionNotFoundException,
      );
    });

    it('remove twice → second call gets NotFound', async () => {
      const user = await createUser();
      const task = await createTask(user.uuid);
      const session = await service.start(user.uuid, {
        kind: FocusSessionKindDto.focus,
        taskUuid: task.uuid,
      });
      await service.remove(user.uuid, session.uuid);
      await expect(
        service.remove(user.uuid, session.uuid),
      ).rejects.toBeInstanceOf(FocusSessionNotFoundException);
    });
  });
});
