import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import {
  CreateRoutineDto,
  RoutineRepeatKindDto,
} from './dto/create-routine.dto';
import {
  RoutineInvalidStateException,
  RoutineLineageNotFoundException,
  RoutineNotFoundException,
} from './routine.exceptions';
import { RoutineService } from './routine.service';

describe('RoutineService (unit)', () => {
  let service: RoutineService;
  const routinesFindFirst = jest.fn();
  const routinesFindUnique = jest.fn();
  const routinesFindMany = jest.fn();
  const routinesCreate = jest.fn();
  const routinesUpdate = jest.fn();

  const FIXED_NOW = new Date('2026-05-20T10:00:00.000Z');

  beforeEach(async () => {
    routinesFindFirst.mockReset();
    routinesFindUnique.mockReset();
    routinesFindMany.mockReset();
    routinesCreate.mockReset();
    routinesUpdate.mockReset();

    jest.useFakeTimers({ now: FIXED_NOW });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutineService,
        {
          provide: PrismaService,
          useValue: {
            routines: {
              findFirst: routinesFindFirst,
              findUnique: routinesFindUnique,
              findMany: routinesFindMany,
              create: routinesCreate,
              update: routinesUpdate,
            },
          },
        },
      ],
    }).compile();

    service = module.get(RoutineService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const baseDayOfWeekDto: CreateRoutineDto = {
    title: '아침 운동',
    repeatKind: RoutineRepeatKindDto.day_of_week,
    repeatWeekdays: [1, 3, 5],
    anchorDate: '2026-05-20',
    startTime: '07:00:00',
    durationSec: 3600,
  };

  const baseWeekDto: CreateRoutineDto = {
    title: '주말 정리',
    repeatKind: RoutineRepeatKindDto.week,
    repeatInterval: 2,
    anchorDate: '2026-05-20',
    startTime: '20:00:00',
    durationSec: 1800,
  };

  // service.create가 PrismaService.routines.create에 전달할 정확한 data shape (lineageUuid 제외).
  const expectedDayOfWeekData = {
    userUuid: 'u',
    title: baseDayOfWeekDto.title,
    repeatKind: 'day_of_week',
    repeatWeekdays: [1, 3, 5],
    repeatInterval: null,
    anchorDate: new Date('2026-05-20'),
    startTime: new Date('1970-01-01T07:00:00Z'),
    durationSec: 3600,
  };

  describe('create — validateRepeat', () => {
    it('day_of_week + non-empty weekdays passes', async () => {
      routinesCreate.mockResolvedValue({ uuid: 'r1' });
      await service.create('u', baseDayOfWeekDto);
      expect(routinesCreate).toHaveBeenCalledWith({
        data: expectedDayOfWeekData,
      });
    });

    it('day_of_week with empty weekdays rejects', async () => {
      await expect(
        service.create('u', { ...baseDayOfWeekDto, repeatWeekdays: [] }),
      ).rejects.toBeInstanceOf(RoutineInvalidStateException);
      expect(routinesCreate).not.toHaveBeenCalled();
    });

    it('day_of_week with repeatInterval rejects', async () => {
      await expect(
        service.create('u', { ...baseDayOfWeekDto, repeatInterval: 2 }),
      ).rejects.toBeInstanceOf(RoutineInvalidStateException);
    });

    it('day_of_week with out-of-range weekday rejects', async () => {
      await expect(
        service.create('u', { ...baseDayOfWeekDto, repeatWeekdays: [0, 1] }),
      ).rejects.toBeInstanceOf(RoutineInvalidStateException);
      await expect(
        service.create('u', { ...baseDayOfWeekDto, repeatWeekdays: [1, 8] }),
      ).rejects.toBeInstanceOf(RoutineInvalidStateException);
    });

    it('week + interval passes', async () => {
      routinesCreate.mockResolvedValue({ uuid: 'r1' });
      await service.create('u', baseWeekDto);
      expect(routinesCreate).toHaveBeenCalledWith({
        data: {
          userUuid: 'u',
          title: baseWeekDto.title,
          repeatKind: 'week',
          repeatWeekdays: [],
          repeatInterval: 2,
          anchorDate: new Date('2026-05-20'),
          startTime: new Date('1970-01-01T20:00:00Z'),
          durationSec: 1800,
        },
      });
    });

    it('week without interval rejects', async () => {
      const dto = { ...baseWeekDto };
      delete dto.repeatInterval;
      await expect(service.create('u', dto)).rejects.toBeInstanceOf(
        RoutineInvalidStateException,
      );
    });

    it('week with weekdays rejects', async () => {
      await expect(
        service.create('u', { ...baseWeekDto, repeatWeekdays: [1] }),
      ).rejects.toBeInstanceOf(RoutineInvalidStateException);
    });
  });

  describe('create — lineageUuid', () => {
    it('omits lineageUuid key from data when not provided (DB default applies)', async () => {
      routinesCreate.mockResolvedValue({ uuid: 'r1' });
      await service.create('u', baseDayOfWeekDto);
      // data 객체에 lineageUuid 키가 아예 없는 상태로 호출됨 → 정확 매칭으로 검증
      expect(routinesCreate).toHaveBeenCalledWith({
        data: expectedDayOfWeekData,
      });
    });

    it('passes lineageUuid when caller owns at least one routine in that lineage', async () => {
      routinesFindFirst.mockResolvedValue({ uuid: 'existing' });
      routinesCreate.mockResolvedValue({ uuid: 'r2' });
      await service.create('u', {
        ...baseDayOfWeekDto,
        lineageUuid: 'lin-1',
      });
      expect(routinesFindFirst).toHaveBeenCalledWith({
        where: { userUuid: 'u', lineageUuid: 'lin-1' },
        select: { uuid: true },
      });
      expect(routinesCreate).toHaveBeenCalledWith({
        data: { ...expectedDayOfWeekData, lineageUuid: 'lin-1' },
      });
    });

    it('rejects when no owned routine exists for the given lineageUuid', async () => {
      routinesFindFirst.mockResolvedValue(null);
      await expect(
        service.create('u', {
          ...baseDayOfWeekDto,
          lineageUuid: 'lin-stranger',
        }),
      ).rejects.toBeInstanceOf(RoutineLineageNotFoundException);
      expect(routinesCreate).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws when missing', async () => {
      routinesFindUnique.mockResolvedValue(null);
      await expect(service.findOne('u', 'r1')).rejects.toBeInstanceOf(
        RoutineNotFoundException,
      );
    });

    it('throws when owned by another user', async () => {
      routinesFindUnique.mockResolvedValue({ uuid: 'r1', userUuid: 'other' });
      await expect(service.findOne('u', 'r1')).rejects.toBeInstanceOf(
        RoutineNotFoundException,
      );
    });

    it('returns routine when owned (deleted included)', async () => {
      const stored = {
        uuid: 'r1',
        userUuid: 'u',
        deletedAt: new Date('2026-05-21T00:00:00Z'),
      };
      routinesFindUnique.mockResolvedValue(stored);
      const r = await service.findOne('u', 'r1');
      expect(r.uuid).toBe('r1');
      expect(r.deletedAt).not.toBeNull();
    });
  });

  describe('findAll', () => {
    it('scopes query to user, newest first, includes deleted', async () => {
      routinesFindMany.mockResolvedValue([]);
      await service.findAll('u');
      expect(routinesFindMany).toHaveBeenCalledWith({
        where: { userUuid: 'u' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('remove (idempotent soft delete)', () => {
    it('updates deletedAt to NOW when null', async () => {
      routinesFindUnique.mockResolvedValue({
        uuid: 'r1',
        userUuid: 'u',
        deletedAt: null,
      });
      routinesUpdate.mockResolvedValue({});
      await service.remove('u', 'r1');
      expect(routinesUpdate).toHaveBeenCalledWith({
        where: { uuid: 'r1' },
        data: { deletedAt: FIXED_NOW },
      });
    });

    it('does not update when already deleted (idempotent)', async () => {
      routinesFindUnique.mockResolvedValue({
        uuid: 'r1',
        userUuid: 'u',
        deletedAt: new Date('2026-05-21T00:00:00Z'),
      });
      await service.remove('u', 'r1');
      expect(routinesUpdate).not.toHaveBeenCalled();
    });

    it('throws when missing', async () => {
      routinesFindUnique.mockResolvedValue(null);
      await expect(service.remove('u', 'r1')).rejects.toBeInstanceOf(
        RoutineNotFoundException,
      );
    });
  });
});
