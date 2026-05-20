import { Test } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import type { PrismaClient } from '@/generated/prisma/client';
import { Language } from '@/generated/prisma/client';
import { createTestPrisma, truncateAll } from '../../../test/setup/prisma-test';
import {
  CreateRoutineDto,
  RoutineRepeatKindDto,
} from './dto/create-routine.dto';
import { RoutineLineageNotFoundException } from './routine.exceptions';
import { RoutineService } from './routine.service';

describe('routines (integration)', () => {
  let prisma: PrismaClient;
  let service: RoutineService;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const module = await Test.createTestingModule({
      providers: [RoutineService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RoutineService);
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

  const baseDayOfWeekDto: CreateRoutineDto = {
    title: '아침 운동',
    repeatKind: RoutineRepeatKindDto.day_of_week,
    repeatWeekdays: [1, 3, 5],
    anchorDate: '2026-05-20',
    startTime: '07:00:00',
    durationSec: 3600,
  };

  it('rejects raw insert with day_of_week + repeat_interval (CHECK constraint)', async () => {
    const user = await createUser();
    await expect(
      prisma.routines.create({
        data: {
          userUuid: user.uuid,
          title: 'bad',
          repeatKind: 'day_of_week',
          repeatWeekdays: [1, 2],
          repeatInterval: 2,
          anchorDate: new Date('2026-05-20'),
          startTime: new Date('1970-01-01T07:00:00Z'),
          durationSec: 3600,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects raw insert with repeat_weekdays out of range (CHECK constraint)', async () => {
    const user = await createUser();
    await expect(
      prisma.routines.create({
        data: {
          userUuid: user.uuid,
          title: 'bad',
          repeatKind: 'day_of_week',
          repeatWeekdays: [1, 8],
          anchorDate: new Date('2026-05-20'),
          startTime: new Date('1970-01-01T07:00:00Z'),
          durationSec: 3600,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects raw insert with week + missing interval', async () => {
    const user = await createUser();
    await expect(
      prisma.routines.create({
        data: {
          userUuid: user.uuid,
          title: 'bad',
          repeatKind: 'week',
          anchorDate: new Date('2026-05-20'),
          startTime: new Date('1970-01-01T07:00:00Z'),
          durationSec: 3600,
        },
      }),
    ).rejects.toThrow();
  });

  it('lineageUuid auto-generated and differs from uuid for a fresh routine', async () => {
    const user = await createUser();
    const created = await service.create(user.uuid, baseDayOfWeekDto);
    expect(created.uuid).toBeDefined();
    expect(created.lineageUuid).toBeDefined();
    expect(created.lineageUuid).not.toBe(created.uuid);
  });

  it('lineageUuid is shared when client passes the previous routine lineageUuid', async () => {
    const user = await createUser();
    const v1 = await service.create(user.uuid, baseDayOfWeekDto);
    const v2 = await service.create(user.uuid, {
      ...baseDayOfWeekDto,
      lineageUuid: v1.lineageUuid,
      title: 'v2',
    });
    expect(v2.lineageUuid).toBe(v1.lineageUuid);
    expect(v2.uuid).not.toBe(v1.uuid);
  });

  it('rejects when lineageUuid belongs to another user', async () => {
    const a = await createUser();
    const b = await createUser();
    const aRoutine = await service.create(a.uuid, baseDayOfWeekDto);
    await expect(
      service.create(b.uuid, {
        ...baseDayOfWeekDto,
        lineageUuid: aRoutine.lineageUuid,
      }),
    ).rejects.toBeInstanceOf(RoutineLineageNotFoundException);
  });

  it('idempotent DELETE keeps the original deletedAt timestamp', async () => {
    const user = await createUser();
    const r = await service.create(user.uuid, baseDayOfWeekDto);

    await service.remove(user.uuid, r.uuid);
    const afterFirst = await prisma.routines.findUnique({
      where: { uuid: r.uuid },
    });
    expect(afterFirst?.deletedAt).not.toBeNull();
    const firstDeletedAt = afterFirst!.deletedAt!;

    // 두 번째 DELETE: 시각 차이를 만들기 위해 약간 대기
    await new Promise((resolve) => setTimeout(resolve, 10));
    await service.remove(user.uuid, r.uuid);
    const afterSecond = await prisma.routines.findUnique({
      where: { uuid: r.uuid },
    });
    expect(afterSecond?.deletedAt?.getTime()).toBe(firstDeletedAt.getTime());
  });

  it('findAll includes both active and soft-deleted routines', async () => {
    const user = await createUser();
    const active1 = await service.create(user.uuid, baseDayOfWeekDto);
    const active2 = await service.create(user.uuid, {
      ...baseDayOfWeekDto,
      title: '저녁 운동',
    });
    const deleted = await service.create(user.uuid, {
      ...baseDayOfWeekDto,
      title: '구버전',
    });
    await service.remove(user.uuid, deleted.uuid);

    const list = await service.findAll(user.uuid);
    expect(list).toHaveLength(3);
    const ids = list.map((r) => r.uuid).sort();
    expect(ids).toEqual([active1.uuid, active2.uuid, deleted.uuid].sort());
    const deletedEntry = list.find((r) => r.uuid === deleted.uuid);
    expect(deletedEntry?.deletedAt).not.toBeNull();
  });
});
