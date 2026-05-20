import { ApiProperty } from '@nestjs/swagger';
import { Routines } from '@/generated/prisma/client';
import { RoutineRepeatKindDto } from '../create-routine.dto';

export class RoutineResponseDto {
  @ApiProperty({
    description: '루틴 고유 식별자 (UUID v4).',
    example: '6f1c2d18-2b1e-4d6a-8a8a-2a3f6f9c1b22',
    format: 'uuid',
  })
  uuid!: string;

  @ApiProperty({
    description: '소유 유저 UUID.',
    example: '11111111-2222-3333-4444-555555555555',
    format: 'uuid',
  })
  userUuid!: string;

  @ApiProperty({
    description:
      '같은 논리적 routine의 시간순 버전 그룹 ID. 클라이언트는 sidebar에서 이 값으로 묶어 한 줄로 표시.',
    example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    format: 'uuid',
  })
  lineageUuid!: string;

  @ApiProperty({ description: '루틴 제목.', example: '아침 운동' })
  title!: string;

  @ApiProperty({
    description: '반복 종류.',
    enum: RoutineRepeatKindDto,
    example: RoutineRepeatKindDto.day_of_week,
  })
  repeatKind!: RoutineRepeatKindDto;

  @ApiProperty({
    description: 'day_of_week일 때 요일 배열 (1=월~7=일). 그 외에는 null.',
    example: [1, 3, 5],
    nullable: true,
    type: [Number],
    required: false,
  })
  repeatWeekdays!: number[] | null;

  @ApiProperty({
    description: 'week/day일 때 반복 간격. 그 외에는 null.',
    example: 2,
    nullable: true,
    required: false,
  })
  repeatInterval!: number | null;

  @ApiProperty({
    description: '기준 날짜 (YYYY-MM-DD).',
    example: '2026-05-20',
  })
  anchorDate!: string;

  @ApiProperty({
    description: '시작 시각 (HH:mm:ss).',
    example: '07:00:00',
  })
  startTime!: string;

  @ApiProperty({ description: '지속 시간 (초).', example: 3600 })
  durationSec!: number;

  @ApiProperty({
    description: '생성 시각 (ISO 8601).',
    example: '2026-05-20T01:23:45.000Z',
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    description: '마지막 수정 시각 (ISO 8601).',
    example: '2026-05-20T01:23:45.000Z',
    format: 'date-time',
  })
  updatedAt!: Date;

  @ApiProperty({
    description:
      '소프트 삭제 시각. null이 아니면 클라이언트는 이 시각 이후 occurrence를 렌더링하지 않는다. 서버는 deleted 여부와 무관하게 항상 반환.',
    example: null,
    nullable: true,
    format: 'date-time',
    required: false,
  })
  deletedAt!: Date | null;

  static fromEntity(r: Routines): RoutineResponseDto {
    const dto = new RoutineResponseDto();
    dto.uuid = r.uuid;
    dto.userUuid = r.userUuid;
    dto.lineageUuid = r.lineageUuid;
    dto.title = r.title;
    dto.repeatKind = r.repeatKind as unknown as RoutineRepeatKindDto;
    dto.repeatWeekdays =
      r.repeatWeekdays && r.repeatWeekdays.length > 0 ? r.repeatWeekdays : null;
    dto.repeatInterval = r.repeatInterval;
    dto.anchorDate = r.anchorDate.toISOString().slice(0, 10);
    dto.startTime = r.startTime.toISOString().slice(11, 19);
    dto.durationSec = r.durationSec;
    dto.createdAt = r.createdAt;
    dto.updatedAt = r.updatedAt;
    dto.deletedAt = r.deletedAt;
    return dto;
  }
}
