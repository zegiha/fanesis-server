import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import { TaskNotFoundException } from '@/domain/task/task.exceptions';
import { Prisma } from '@/generated/prisma/client';
import { FocusSessionKindDto } from './dto/start-focus-session.dto';
import {
  FocusSessionAlreadyActiveException,
  FocusSessionAlreadyEndedException,
  FocusSessionNotFoundException,
} from './focus.exceptions';
import { FocusService } from './focus.service';

describe('FocusService (unit)', () => {
  let service: FocusService;
  const tasksFindUnique = jest.fn();
  const usersFindUnique = jest.fn();
  const focusCreate = jest.fn();
  const focusFindUnique = jest.fn();
  const focusFindFirst = jest.fn();
  const focusFindMany = jest.fn();
  const focusUpdate = jest.fn();
  const focusDelete = jest.fn();

  const FIXED_NOW = new Date('2026-05-20T10:00:00.000Z');
  const TASK_UUID = '11111111-1111-1111-1111-111111111111';
  const SESSION_UUID = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    tasksFindUnique.mockReset();
    usersFindUnique.mockReset();
    focusCreate.mockReset();
    focusFindUnique.mockReset();
    focusFindFirst.mockReset();
    focusFindMany.mockReset();
    focusUpdate.mockReset();
    focusDelete.mockReset();

    jest.useFakeTimers({ now: FIXED_NOW });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FocusService,
        {
          provide: PrismaService,
          useValue: {
            tasks: { findUnique: tasksFindUnique },
            users: { findUnique: usersFindUnique },
            focusSessions: {
              create: focusCreate,
              findUnique: focusFindUnique,
              findFirst: focusFindFirst,
              findMany: focusFindMany,
              update: focusUpdate,
              delete: focusDelete,
            },
          },
        },
      ],
    }).compile();

    service = module.get(FocusService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const startDto = {
    kind: FocusSessionKindDto.focus,
    taskUuid: TASK_UUID,
  };

  describe('start', () => {
    it('happy path inserts with startedAt=NOW and returns the row', async () => {
      tasksFindUnique.mockResolvedValue({ uuid: TASK_UUID, userUuid: 'u' });
      const stored = { uuid: SESSION_UUID };
      focusCreate.mockResolvedValue(stored);

      const result = await service.start('u', startDto);

      expect(focusCreate).toHaveBeenCalledWith({
        data: {
          userUuid: 'u',
          kind: FocusSessionKindDto.focus,
          taskUuid: TASK_UUID,
          startedAt: FIXED_NOW,
        },
      });
      expect(result).toBe(stored);
    });

    it('throws TaskNotFoundException when task does not exist', async () => {
      tasksFindUnique.mockResolvedValue(null);
      await expect(service.start('u', startDto)).rejects.toBeInstanceOf(
        TaskNotFoundException,
      );
      expect(focusCreate).not.toHaveBeenCalled();
    });

    it('throws TaskNotFoundException when task is owned by another user', async () => {
      tasksFindUnique.mockResolvedValue({
        uuid: TASK_UUID,
        userUuid: 'other',
      });
      await expect(service.start('u', startDto)).rejects.toBeInstanceOf(
        TaskNotFoundException,
      );
      expect(focusCreate).not.toHaveBeenCalled();
    });

    it('maps P2002 on idx_focus_sessions_user_active to AlreadyActive', async () => {
      tasksFindUnique.mockResolvedValue({ uuid: TASK_UUID, userUuid: 'u' });
      const dupErr = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: 'idx_focus_sessions_user_active' },
      });
      focusCreate.mockRejectedValue(dupErr);

      await expect(service.start('u', startDto)).rejects.toBeInstanceOf(
        FocusSessionAlreadyActiveException,
      );
    });

    it('rethrows non-P2002 errors', async () => {
      tasksFindUnique.mockResolvedValue({ uuid: TASK_UUID, userUuid: 'u' });
      const otherErr = new Error('boom');
      focusCreate.mockRejectedValue(otherErr);

      await expect(service.start('u', startDto)).rejects.toBe(otherErr);
    });
  });

  describe('end', () => {
    it('happy path updates endedAt to NOW', async () => {
      focusFindUnique.mockResolvedValue({
        uuid: SESSION_UUID,
        userUuid: 'u',
        endedAt: null,
      });
      const updated = { uuid: SESSION_UUID, endedAt: FIXED_NOW };
      focusUpdate.mockResolvedValue(updated);

      const result = await service.end('u', SESSION_UUID);

      expect(focusUpdate).toHaveBeenCalledWith({
        where: { uuid: SESSION_UUID },
        data: { endedAt: FIXED_NOW },
      });
      expect(result).toBe(updated);
    });

    it('throws NotFound when session missing', async () => {
      focusFindUnique.mockResolvedValue(null);
      await expect(service.end('u', SESSION_UUID)).rejects.toBeInstanceOf(
        FocusSessionNotFoundException,
      );
      expect(focusUpdate).not.toHaveBeenCalled();
    });

    it('throws NotFound when owned by another user (no existence leak)', async () => {
      focusFindUnique.mockResolvedValue({
        uuid: SESSION_UUID,
        userUuid: 'other',
        endedAt: null,
      });
      await expect(service.end('u', SESSION_UUID)).rejects.toBeInstanceOf(
        FocusSessionNotFoundException,
      );
      expect(focusUpdate).not.toHaveBeenCalled();
    });

    it('throws AlreadyEnded when session already ended', async () => {
      focusFindUnique.mockResolvedValue({
        uuid: SESSION_UUID,
        userUuid: 'u',
        endedAt: new Date('2026-05-20T09:00:00.000Z'),
      });
      await expect(service.end('u', SESSION_UUID)).rejects.toBeInstanceOf(
        FocusSessionAlreadyEndedException,
      );
      expect(focusUpdate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes when owned, regardless of active/ended state', async () => {
      focusFindUnique.mockResolvedValue({
        uuid: SESSION_UUID,
        userUuid: 'u',
        endedAt: null,
      });
      focusDelete.mockResolvedValue({});
      await service.remove('u', SESSION_UUID);
      expect(focusDelete).toHaveBeenCalledWith({
        where: { uuid: SESSION_UUID },
      });
    });

    it('throws NotFound when session missing', async () => {
      focusFindUnique.mockResolvedValue(null);
      await expect(service.remove('u', SESSION_UUID)).rejects.toBeInstanceOf(
        FocusSessionNotFoundException,
      );
      expect(focusDelete).not.toHaveBeenCalled();
    });

    it('throws NotFound when owned by another user', async () => {
      focusFindUnique.mockResolvedValue({
        uuid: SESSION_UUID,
        userUuid: 'other',
        endedAt: null,
      });
      await expect(service.remove('u', SESSION_UUID)).rejects.toBeInstanceOf(
        FocusSessionNotFoundException,
      );
      expect(focusDelete).not.toHaveBeenCalled();
    });
  });

  describe('getActive', () => {
    it('returns the active session when present', async () => {
      const active = { uuid: SESSION_UUID, userUuid: 'u', endedAt: null };
      focusFindFirst.mockResolvedValue(active);
      const result = await service.getActive('u');
      expect(focusFindFirst).toHaveBeenCalledWith({
        where: { userUuid: 'u', endedAt: null },
      });
      expect(result).toBe(active);
    });

    it('returns null when no active session', async () => {
      focusFindFirst.mockResolvedValue(null);
      const result = await service.getActive('u');
      expect(result).toBeNull();
    });
  });

  describe('findByDate', () => {
    it('converts date+timezone(Asia/Seoul) to UTC range and queries DESC', async () => {
      usersFindUnique.mockResolvedValue({ timezone: 'Asia/Seoul' });
      focusFindMany.mockResolvedValue([]);

      await service.findByDate('u', '2026-05-20');

      // Asia/Seoul (UTC+9) → 2026-05-20 00:00 KST = 2026-05-19 15:00 UTC
      //                     2026-05-21 00:00 KST = 2026-05-20 15:00 UTC
      expect(focusFindMany).toHaveBeenCalledWith({
        where: {
          userUuid: 'u',
          startedAt: {
            gte: new Date('2026-05-19T15:00:00.000Z'),
            lt: new Date('2026-05-20T15:00:00.000Z'),
          },
        },
        orderBy: { startedAt: 'desc' },
      });
    });

    it('falls back to UTC when user has no timezone (defensive)', async () => {
      usersFindUnique.mockResolvedValue(null);
      focusFindMany.mockResolvedValue([]);

      await service.findByDate('u', '2026-05-20');

      expect(focusFindMany).toHaveBeenCalledWith({
        where: {
          userUuid: 'u',
          startedAt: {
            gte: new Date('2026-05-20T00:00:00.000Z'),
            lt: new Date('2026-05-21T00:00:00.000Z'),
          },
        },
        orderBy: { startedAt: 'desc' },
      });
    });

    it('returns empty array when nothing matches', async () => {
      usersFindUnique.mockResolvedValue({ timezone: 'Asia/Seoul' });
      focusFindMany.mockResolvedValue([]);
      const result = await service.findByDate('u', '2026-05-20');
      expect(result).toEqual([]);
    });
  });
});
