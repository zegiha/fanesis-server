import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Prisma, Routines } from '@/generated/prisma/client';
import {
  CreateRoutineDto,
  RoutineRepeatKindDto,
} from './dto/create-routine.dto';
import {
  RoutineInvalidStateException,
  RoutineLineageNotFoundException,
  RoutineNotFoundException,
} from './routine.exceptions';

@Injectable()
export class RoutineService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userUuid: string, dto: CreateRoutineDto): Promise<Routines> {
    this.validateRepeat(dto);

    if (dto.lineageUuid !== undefined) {
      const existing = await this.prisma.routines.findFirst({
        where: { userUuid, lineageUuid: dto.lineageUuid },
        select: { uuid: true },
      });
      if (!existing) {
        throw new RoutineLineageNotFoundException();
      }
    }

    const data: Prisma.RoutinesUncheckedCreateInput = {
      userUuid,
      title: dto.title,
      repeatKind: dto.repeatKind,
      repeatWeekdays:
        dto.repeatKind === RoutineRepeatKindDto.day_of_week
          ? (dto.repeatWeekdays ?? [])
          : [],
      repeatInterval:
        dto.repeatKind === RoutineRepeatKindDto.day_of_week
          ? null
          : (dto.repeatInterval ?? null),
      anchorDate: new Date(dto.anchorDate),
      startTime: parseTimeToDate(dto.startTime),
      durationSec: dto.durationSec,
    };
    if (dto.lineageUuid !== undefined) {
      data.lineageUuid = dto.lineageUuid;
    }

    return this.prisma.routines.create({ data });
  }

  findAll(userUuid: string): Promise<Routines[]> {
    return this.prisma.routines.findMany({
      where: { userUuid },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userUuid: string, routineUuid: string): Promise<Routines> {
    const routine = await this.prisma.routines.findUnique({
      where: { uuid: routineUuid },
    });
    if (!routine || routine.userUuid !== userUuid) {
      throw new RoutineNotFoundException();
    }
    return routine;
  }

  async remove(userUuid: string, routineUuid: string): Promise<void> {
    const routine = await this.findOne(userUuid, routineUuid);
    if (routine.deletedAt !== null) {
      // 멱등 — 이미 삭제된 경우 그대로 204
      return;
    }
    await this.prisma.routines.update({
      where: { uuid: routineUuid },
      data: { deletedAt: new Date() },
    });
  }

  private validateRepeat(dto: CreateRoutineDto): void {
    if (dto.repeatKind === RoutineRepeatKindDto.day_of_week) {
      if (!dto.repeatWeekdays || dto.repeatWeekdays.length === 0) {
        throw new RoutineInvalidStateException(
          'repeatKind=day_of_week requires non-empty repeatWeekdays',
        );
      }
      if (dto.repeatInterval !== undefined && dto.repeatInterval !== null) {
        throw new RoutineInvalidStateException(
          'repeatKind=day_of_week forbids repeatInterval',
        );
      }
      const valid = dto.repeatWeekdays.every((d) => d >= 1 && d <= 7);
      if (!valid) {
        throw new RoutineInvalidStateException(
          'repeatWeekdays must be integers in 1..7',
        );
      }
    } else {
      // week | day
      if (dto.repeatInterval == null || dto.repeatInterval <= 0) {
        throw new RoutineInvalidStateException(
          'repeatKind=week/day requires positive repeatInterval',
        );
      }
      if (dto.repeatWeekdays && dto.repeatWeekdays.length > 0) {
        throw new RoutineInvalidStateException(
          'repeatKind=week/day forbids repeatWeekdays',
        );
      }
    }
  }
}

function parseTimeToDate(hms: string): Date {
  return new Date(`1970-01-01T${hms}Z`);
}
