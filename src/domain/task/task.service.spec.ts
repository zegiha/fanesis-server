import { Test, TestingModule } from '@nestjs/testing';
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

  beforeEach(async () => {
    tasksCreate.mockReset();
    tasksFindMany.mockReset();
    tasksFindUnique.mockReset();
    tasksUpdate.mockReset();
    tasksDelete.mockReset();
    foldersFindUnique.mockReset();
    tasksCount.mockReset();

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
          },
        },
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

  describe('findAll', () => {
    it('queries by user only', async () => {
      tasksFindMany.mockResolvedValue([]);
      await service.findAll('u');
      expect(tasksFindMany).toHaveBeenCalledWith({
        where: { userUuid: 'u' },
        orderBy: { createdAt: 'desc' },
      });
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
