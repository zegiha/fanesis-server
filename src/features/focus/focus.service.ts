import { Injectable } from '@nestjs/common';
import { addDays, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { PrismaService } from '@/core/prisma/prisma.service';
import { TaskNotFoundException } from '@/domain/task/task.exceptions';
import { FocusSessions, Prisma } from '@/generated/prisma/client';
import { StartFocusSessionDto } from './dto/start-focus-session.dto';
import {
  FocusSessionAlreadyActiveException,
  FocusSessionAlreadyEndedException,
  FocusSessionNotFoundException,
} from './focus.exceptions';

const ACTIVE_SESSION_UNIQUE_INDEX = 'idx_focus_sessions_user_active';

@Injectable()
export class FocusService {
  constructor(private readonly prisma: PrismaService) {}

  async start(
    userUuid: string,
    dto: StartFocusSessionDto,
  ): Promise<FocusSessions> {
    const task = await this.prisma.tasks.findUnique({
      where: { uuid: dto.taskUuid },
      select: { uuid: true, userUuid: true },
    });
    if (!task || task.userUuid !== userUuid) {
      throw new TaskNotFoundException();
    }

    try {
      return await this.prisma.focusSessions.create({
        data: {
          userUuid,
          kind: dto.kind,
          taskUuid: dto.taskUuid,
          startedAt: new Date(),
        },
      });
    } catch (e) {
      if (isActiveSessionUniqueViolation(e)) {
        throw new FocusSessionAlreadyActiveException();
      }
      throw e;
    }
  }

  async end(userUuid: string, sessionUuid: string): Promise<FocusSessions> {
    const session = await this.findOwnedOrThrow(userUuid, sessionUuid);
    if (session.endedAt !== null) {
      throw new FocusSessionAlreadyEndedException();
    }
    return this.prisma.focusSessions.update({
      where: { uuid: sessionUuid },
      data: { endedAt: new Date() },
    });
  }

  async remove(userUuid: string, sessionUuid: string): Promise<void> {
    await this.findOwnedOrThrow(userUuid, sessionUuid);
    await this.prisma.focusSessions.delete({ where: { uuid: sessionUuid } });
  }

  getActive(userUuid: string): Promise<FocusSessions | null> {
    return this.prisma.focusSessions.findFirst({
      where: { userUuid, endedAt: null },
    });
  }

  async findByDate(userUuid: string, date: string): Promise<FocusSessions[]> {
    const user = await this.prisma.users.findUnique({
      where: { uuid: userUuid },
      select: { timezone: true },
    });
    const timezone = user?.timezone ?? 'UTC';

    const localStart = parseISO(`${date}T00:00:00`);
    const localEnd = addDays(localStart, 1);
    const startUtc = fromZonedTime(localStart, timezone);
    const endUtc = fromZonedTime(localEnd, timezone);

    return this.prisma.focusSessions.findMany({
      where: {
        userUuid,
        startedAt: { gte: startUtc, lt: endUtc },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  private async findOwnedOrThrow(
    userUuid: string,
    sessionUuid: string,
  ): Promise<FocusSessions> {
    const session = await this.prisma.focusSessions.findUnique({
      where: { uuid: sessionUuid },
    });
    if (!session || session.userUuid !== userUuid) {
      throw new FocusSessionNotFoundException();
    }
    return session;
  }
}

function isActiveSessionUniqueViolation(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== 'P2002') return false;
  const target = (e.meta as { target?: unknown } | undefined)?.target;
  if (typeof target === 'string') return target === ACTIVE_SESSION_UNIQUE_INDEX;
  if (Array.isArray(target)) return target.includes('user_uuid');
  return true;
}
