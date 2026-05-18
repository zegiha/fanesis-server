import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Prisma, Tasks } from '@/generated/prisma/client';
import { TASK_UPDATED_EVENT, type TaskUpdatedEvent } from './task.events';
import {
  CreateTaskDto,
  TaskActiveKindDto,
  TaskBacklogKindDto,
  TaskTimeboxKindDto,
} from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  FolderNotFoundException,
  TaskBig3LimitExceededException,
  TaskInvalidStateException,
  TaskNotFoundException,
} from './task.exceptions';

const BIG3_DAILY_LIMIT = 3;

type TaskState = {
  backlogKind: TaskBacklogKindDto;
  backlogFolderId?: string | null;
  activeKind?: TaskActiveKindDto | null;
  timeboxKind?: CreateTaskDto['timeboxKind'] | null;
  scheduledDate?: string | null;
  durationSec?: number | null;
  chunkSec?: number | null;
  breakSec?: number | null;
};

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(userUuid: string, dto: CreateTaskDto): Promise<Tasks> {
    this.validateState(dto);

    if (dto.backlogKind === TaskBacklogKindDto.folder) {
      await this.assertFolderOwned(userUuid, dto.backlogFolderId!);
    }

    if (dto.activeKind === TaskActiveKindDto.big3 && dto.scheduledDate) {
      await this.assertBig3CapacityAvailable(
        userUuid,
        dto.scheduledDate,
        undefined,
      );
    }

    return this.prisma.tasks.create({
      data: {
        userUuid,
        title: dto.title,
        priority: dto.priority ?? null,
        affiliation: dto.affiliation ?? null,
        backlogKind: dto.backlogKind,
        backlogFolderId: dto.backlogFolderId ?? null,
        activeKind: dto.activeKind ?? null,
        timeboxKind: dto.timeboxKind ?? null,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        startTime: dto.startTime ? parseTime(dto.startTime) : null,
        durationSec: dto.durationSec ?? null,
        chunkSec: dto.chunkSec ?? null,
        breakSec: dto.breakSec ?? null,
      },
    });
  }

  findAll(userUuid: string): Promise<Tasks[]> {
    return this.prisma.tasks.findMany({
      where: { userUuid },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userUuid: string, taskUuid: string): Promise<Tasks> {
    const task = await this.prisma.tasks.findUnique({
      where: { uuid: taskUuid },
    });
    if (!task || task.userUuid !== userUuid) {
      throw new TaskNotFoundException();
    }
    return task;
  }

  async update(
    userUuid: string,
    taskUuid: string,
    dto: UpdateTaskDto,
  ): Promise<Tasks> {
    const current = await this.findOne(userUuid, taskUuid);

    const merged: TaskState = {
      backlogKind:
        dto.backlogKind ?? (current.backlogKind as TaskBacklogKindDto),
      backlogFolderId:
        dto.backlogFolderId !== undefined
          ? dto.backlogFolderId
          : current.backlogFolderId,
      activeKind:
        dto.activeKind !== undefined
          ? dto.activeKind
          : (current.activeKind as TaskActiveKindDto | null),
      timeboxKind:
        dto.timeboxKind !== undefined
          ? dto.timeboxKind
          : (current.timeboxKind as TaskTimeboxKindDto | null),
      scheduledDate:
        dto.scheduledDate !== undefined
          ? dto.scheduledDate
          : current.scheduledDate
            ? current.scheduledDate.toISOString().slice(0, 10)
            : null,
      durationSec:
        dto.durationSec !== undefined ? dto.durationSec : current.durationSec,
      chunkSec: dto.chunkSec !== undefined ? dto.chunkSec : current.chunkSec,
      breakSec: dto.breakSec !== undefined ? dto.breakSec : current.breakSec,
    };

    this.validateState(merged);

    if (
      merged.backlogKind === TaskBacklogKindDto.folder &&
      merged.backlogFolderId &&
      merged.backlogFolderId !== current.backlogFolderId
    ) {
      await this.assertFolderOwned(userUuid, merged.backlogFolderId);
    }

    if (merged.activeKind === TaskActiveKindDto.big3 && merged.scheduledDate) {
      const currentDateStr = current.scheduledDate
        ? current.scheduledDate.toISOString().slice(0, 10)
        : null;
      const wasBig3OnSameDate =
        current.activeKind === 'big3' &&
        currentDateStr === merged.scheduledDate;
      if (!wasBig3OnSameDate) {
        await this.assertBig3CapacityAvailable(
          userUuid,
          merged.scheduledDate,
          taskUuid,
        );
      }
    }

    const data: Prisma.TasksUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.priority !== undefined) data.priority = dto.priority ?? null;
    if (dto.affiliation !== undefined)
      data.affiliation = dto.affiliation ?? null;
    if (dto.backlogKind !== undefined) data.backlogKind = dto.backlogKind;
    if (dto.backlogFolderId !== undefined) {
      data.backlogFolder = dto.backlogFolderId
        ? { connect: { uuid: dto.backlogFolderId } }
        : { disconnect: true };
    }
    if (dto.activeKind !== undefined) data.activeKind = dto.activeKind ?? null;
    if (dto.timeboxKind !== undefined)
      data.timeboxKind = dto.timeboxKind ?? null;
    if (dto.scheduledDate !== undefined)
      data.scheduledDate = dto.scheduledDate
        ? new Date(dto.scheduledDate)
        : null;
    if (dto.startTime !== undefined)
      data.startTime = dto.startTime ? parseTime(dto.startTime) : null;
    if (dto.durationSec !== undefined) data.durationSec = dto.durationSec;
    if (dto.chunkSec !== undefined) data.chunkSec = dto.chunkSec;
    if (dto.breakSec !== undefined) data.breakSec = dto.breakSec;

    const updated = await this.prisma.tasks.update({
      where: { uuid: taskUuid },
      data,
    });
    this.events.emit(TASK_UPDATED_EVENT, {
      before: {
        scheduledDate: current.scheduledDate,
        startTime: current.startTime,
        durationSec: current.durationSec,
        affiliation: current.affiliation,
      },
      after: updated,
    } satisfies TaskUpdatedEvent);
    return updated;
  }

  async remove(userUuid: string, taskUuid: string): Promise<void> {
    await this.findOne(userUuid, taskUuid);
    await this.prisma.tasks.delete({ where: { uuid: taskUuid } });
  }

  private validateState(state: TaskState): void {
    if (
      state.backlogKind === TaskBacklogKindDto.folder &&
      !state.backlogFolderId
    ) {
      throw new TaskInvalidStateException(
        'backlogKind=folder requires backlogFolderId',
      );
    }
    if (
      state.backlogKind === TaskBacklogKindDto.inbox &&
      state.backlogFolderId
    ) {
      throw new TaskInvalidStateException(
        'backlogKind=inbox forbids backlogFolderId',
      );
    }
    if (state.timeboxKind && !state.activeKind) {
      throw new TaskInvalidStateException(
        'timeboxKind requires activeKind to be set',
      );
    }
    if (state.activeKind === TaskActiveKindDto.big3 && !state.scheduledDate) {
      throw new TaskInvalidStateException(
        'activeKind=big3 requires scheduledDate',
      );
    }
    if (
      state.chunkSec != null &&
      state.durationSec != null &&
      state.chunkSec > state.durationSec
    ) {
      throw new TaskInvalidStateException('chunkSec must be <= durationSec');
    }
    if (state.breakSec != null && state.chunkSec == null) {
      throw new TaskInvalidStateException(
        'breakSec requires chunkSec to be set',
      );
    }
  }

  private async assertBig3CapacityAvailable(
    userUuid: string,
    scheduledDate: string,
    excludeTaskUuid: string | undefined,
  ): Promise<void> {
    const count = await this.prisma.tasks.count({
      where: {
        userUuid,
        activeKind: 'big3',
        scheduledDate: new Date(scheduledDate),
        ...(excludeTaskUuid ? { uuid: { not: excludeTaskUuid } } : {}),
      },
    });
    if (count >= BIG3_DAILY_LIMIT) {
      throw new TaskBig3LimitExceededException();
    }
  }

  private async assertFolderOwned(
    userUuid: string,
    folderUuid: string,
  ): Promise<void> {
    const folder = await this.prisma.folders.findUnique({
      where: { uuid: folderUuid },
    });
    if (!folder || folder.userUuid !== userUuid) {
      throw new FolderNotFoundException();
    }
  }
}

function parseTime(value: string): Date {
  const [hh, mm, ss = '00'] = value.split(':');
  return new Date(Date.UTC(1970, 0, 1, Number(hh), Number(mm), Number(ss)));
}
