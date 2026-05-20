import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/core/prisma/prisma.service';
import {
  CreateTaskDto,
  TaskBacklogKindDto,
  TaskActiveKindDto,
} from './dto/create-task.dto';
import {
  FolderNotFoundException,
  TaskBig3LimitExceededException,
  TaskInvalidStateException,
  TaskNotFoundException,
} from './task.exceptions';
import { TaskService } from './task.service';

describe('TaskService (unit)', () => {
  let service: TaskService;
  const tasksCreate = jest.fn();
  const tasksFindMany = jest.fn();
  const tasksFindUnique = jest.fn();
  const tasksUpdate = jest.fn();
  const tasksDelete = jest.fn();
  const foldersFindUnique = jest.fn();
  const tasksCount = jest.fn();
  const txn = jest.fn();

  beforeEach(async () => {
    tasksCreate.mockReset();
    tasksFindMany.mockReset();
    tasksFindUnique.mockReset();
    tasksUpdate.mockReset();
    tasksDelete.mockReset();
    foldersFindUnique.mockReset();
    tasksCount.mockReset();
    txn.mockReset();
    txn.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        {
          provide: PrismaService,
          useValue: {
            tasks: {
              create: tasksCreate,
              findMany: tasksFindMany,
              findUnique: tasksFindUnique,
              update: tasksUpdate,
              delete: tasksDelete,
              count: tasksCount,
            },
            folders: { findUnique: foldersFindUnique },
            $transaction: txn,
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(TaskService);
  });

  describe('create', () => {
    it('creates an inbox task with defaults', async () => {
      tasksCreate.mockResolvedValue({ uuid: 't1' });
      const dto: CreateTaskDto = {
        title: 'X',
        backlogKind: TaskBacklogKindDto.inbox,
      };
      await service.create('user-1', dto);
      expect(tasksCreate).toHaveBeenCalledTimes(1);
      const calls = tasksCreate.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(calls[0][0].data).toMatchObject({
        userUuid: 'user-1',
        title: 'X',
        backlogKind: 'inbox',
        backlogFolderId: null,
      });
    });

    it('throws TaskInvalidStateException when active=big3 without scheduledDate', async () => {
      const dto: CreateTaskDto = {
        title: 'X',
        backlogKind: TaskBacklogKindDto.inbox,
        activeKind: TaskActiveKindDto.big3,
      };
      await expect(service.create('u', dto)).rejects.toBeInstanceOf(
        TaskInvalidStateException,
      );
    });

    it('throws TaskInvalidStateException when backlogKind=folder without backlogFolderId', async () => {
      const dto: CreateTaskDto = {
        title: 'X',
        backlogKind: TaskBacklogKindDto.folder,
      };
      await expect(service.create('u', dto)).rejects.toBeInstanceOf(
        TaskInvalidStateException,
      );
    });

    it('throws FolderNotFoundException when folder does not belong to user', async () => {
      foldersFindUnique.mockResolvedValue({ uuid: 'f1', userUuid: 'other' });
      const dto: CreateTaskDto = {
        title: 'X',
        backlogKind: TaskBacklogKindDto.folder,
        backlogFolderId: 'f1',
      };
      await expect(service.create('u', dto)).rejects.toBeInstanceOf(
        FolderNotFoundException,
      );
    });

    it('throws FolderNotFoundException when folder missing', async () => {
      foldersFindUnique.mockResolvedValue(null);
      const dto: CreateTaskDto = {
        title: 'X',
        backlogKind: TaskBacklogKindDto.folder,
        backlogFolderId: 'f-missing',
      };
      await expect(service.create('u', dto)).rejects.toBeInstanceOf(
        FolderNotFoundException,
      );
    });
  });

  describe('big3 daily limit', () => {
    it('throws TaskBig3LimitExceededException when 3 big3 tasks already exist on the same date', async () => {
      tasksCount.mockResolvedValue(3);
      const dto: CreateTaskDto = {
        title: 'fourth',
        backlogKind: TaskBacklogKindDto.inbox,
        activeKind: TaskActiveKindDto.big3,
        scheduledDate: '2026-05-17',
      };
      await expect(service.create('u', dto)).rejects.toBeInstanceOf(
        TaskBig3LimitExceededException,
      );
      expect(tasksCount).toHaveBeenCalledWith({
        where: {
          userUuid: 'u',
          activeKind: 'big3',
          scheduledDate: new Date('2026-05-17'),
        },
      });
    });

    it('allows creating big3 when count is below limit', async () => {
      tasksCount.mockResolvedValue(2);
      tasksCreate.mockResolvedValue({ uuid: 't1' });
      const dto: CreateTaskDto = {
        title: 'third',
        backlogKind: TaskBacklogKindDto.inbox,
        activeKind: TaskActiveKindDto.big3,
        scheduledDate: '2026-05-17',
      };
      await expect(service.create('u', dto)).resolves.toBeDefined();
    });
  });

  describe('findOne', () => {
    it('returns task when owned', async () => {
      tasksFindUnique.mockResolvedValue({ uuid: 't1', userUuid: 'u' });
      const task = await service.findOne('u', 't1');
      expect(task.uuid).toBe('t1');
    });

    it('throws when task missing', async () => {
      tasksFindUnique.mockResolvedValue(null);
      await expect(service.findOne('u', 't1')).rejects.toBeInstanceOf(
        TaskNotFoundException,
      );
    });

    it('throws when task owned by another user', async () => {
      tasksFindUnique.mockResolvedValue({ uuid: 't1', userUuid: 'other' });
      await expect(service.findOne('u', 't1')).rejects.toBeInstanceOf(
        TaskNotFoundException,
      );
    });
  });

  describe('findInbox', () => {
    it('queries inbox tasks excluding completed, with pagination', async () => {
      tasksFindMany.mockResolvedValue([{ uuid: 't1' }]);
      tasksCount.mockResolvedValue(1);
      const result = await service.findInbox('u', 2, 20);
      expect(tasksFindMany).toHaveBeenCalledWith({
        where: { userUuid: 'u', backlogKind: 'inbox', doneDate: null },
        orderBy: { createdAt: 'desc' },
        skip: 20,
        take: 20,
      });
      expect(tasksCount).toHaveBeenCalledWith({
        where: { userUuid: 'u', backlogKind: 'inbox', doneDate: null },
      });
      expect(result).toEqual({ items: [{ uuid: 't1' }], total: 1 });
    });
  });

  describe('findByFolder', () => {
    it('returns tasks of an owned folder excluding completed', async () => {
      foldersFindUnique.mockResolvedValue({ uuid: 'f1', userUuid: 'u' });
      tasksFindMany.mockResolvedValue([{ uuid: 't1' }]);
      const result = await service.findByFolder('u', 'f1');
      expect(tasksFindMany).toHaveBeenCalledWith({
        where: { userUuid: 'u', backlogFolderId: 'f1', doneDate: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([{ uuid: 't1' }]);
    });

    it('throws FolderNotFoundException when folder missing', async () => {
      foldersFindUnique.mockResolvedValue(null);
      await expect(
        service.findByFolder('u', 'f-missing'),
      ).rejects.toBeInstanceOf(FolderNotFoundException);
      expect(tasksFindMany).not.toHaveBeenCalled();
    });

    it('throws FolderNotFoundException when folder belongs to another user', async () => {
      foldersFindUnique.mockResolvedValue({ uuid: 'f1', userUuid: 'other' });
      await expect(service.findByFolder('u', 'f1')).rejects.toBeInstanceOf(
        FolderNotFoundException,
      );
      expect(tasksFindMany).not.toHaveBeenCalled();
    });
  });

  describe('findByDate', () => {
    it('queries tasks by scheduled date including completed, ordered by startTime asc', async () => {
      tasksFindMany.mockResolvedValue([]);
      await service.findByDate('u', '2026-05-20');
      expect(tasksFindMany).toHaveBeenCalledWith({
        where: { userUuid: 'u', scheduledDate: new Date('2026-05-20') },
        orderBy: [{ startTime: 'asc' }, { createdAt: 'desc' }],
      });
    });
  });

  describe('findDone', () => {
    it('queries completed tasks ordered by doneDate desc with pagination', async () => {
      tasksFindMany.mockResolvedValue([{ uuid: 't1' }, { uuid: 't2' }]);
      tasksCount.mockResolvedValue(42);
      const result = await service.findDone('u', 1, 20);
      expect(tasksFindMany).toHaveBeenCalledWith({
        where: { userUuid: 'u', doneDate: { not: null } },
        orderBy: { doneDate: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(tasksCount).toHaveBeenCalledWith({
        where: { userUuid: 'u', doneDate: { not: null } },
      });
      expect(result.total).toBe(42);
      expect(result.items).toHaveLength(2);
    });
  });

  describe('update doneDate', () => {
    const baseTask = {
      uuid: 't1',
      userUuid: 'u',
      title: 'X',
      backlogKind: 'inbox',
      backlogFolderId: null,
      activeKind: null,
      timeboxKind: null,
      scheduledDate: null,
      startTime: null,
      durationSec: null,
      chunkSec: null,
      breakSec: null,
      priority: null,
      affiliation: null,
      doneDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('marks a task as done with an ISO timestamp', async () => {
      tasksFindUnique.mockResolvedValue(baseTask);
      tasksUpdate.mockResolvedValue({
        ...baseTask,
        doneDate: new Date('2026-05-20T10:30:00.000Z'),
      });
      await service.update('u', 't1', {
        doneDate: '2026-05-20T10:30:00.000Z',
      });
      const calls = tasksUpdate.mock.calls as Array<
        [{ where: unknown; data: Record<string, unknown> }]
      >;
      expect(calls[0][0].data.doneDate).toEqual(
        new Date('2026-05-20T10:30:00.000Z'),
      );
    });

    it('unmarks a task by passing null', async () => {
      tasksFindUnique.mockResolvedValue({
        ...baseTask,
        doneDate: new Date('2026-05-20T10:30:00.000Z'),
      });
      tasksUpdate.mockResolvedValue({ ...baseTask, doneDate: null });
      await service.update('u', 't1', { doneDate: null });
      const calls = tasksUpdate.mock.calls as Array<
        [{ where: unknown; data: Record<string, unknown> }]
      >;
      expect(calls[0][0].data.doneDate).toBeNull();
    });

    it('leaves doneDate untouched when not provided', async () => {
      const existing = new Date('2026-05-20T10:30:00.000Z');
      tasksFindUnique.mockResolvedValue({ ...baseTask, doneDate: existing });
      tasksUpdate.mockResolvedValue({ ...baseTask, doneDate: existing });
      await service.update('u', 't1', { title: 'renamed' });
      const calls = tasksUpdate.mock.calls as Array<
        [{ where: unknown; data: Record<string, unknown> }]
      >;
      expect('doneDate' in calls[0][0].data).toBe(false);
    });
  });

  describe('remove', () => {
    it('deletes when owned', async () => {
      tasksFindUnique.mockResolvedValue({ uuid: 't1', userUuid: 'u' });
      tasksDelete.mockResolvedValue({});
      await service.remove('u', 't1');
      expect(tasksDelete).toHaveBeenCalledWith({ where: { uuid: 't1' } });
    });

    it('throws if not found before deleting', async () => {
      tasksFindUnique.mockResolvedValue(null);
      await expect(service.remove('u', 't1')).rejects.toBeInstanceOf(
        TaskNotFoundException,
      );
      expect(tasksDelete).not.toHaveBeenCalled();
    });
  });
});
