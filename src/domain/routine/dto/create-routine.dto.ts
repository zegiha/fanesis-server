import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export enum RoutineRepeatKindDto {
  day_of_week = 'day_of_week',
  week = 'week',
  day = 'day',
}

export class CreateRoutineDto {
  @ApiPropertyOptional({
    description:
      '같은 논리적 routine의 시간순 버전 그룹 ID. "수정"에 해당하는 신규 routine 생성 시 이전 routine의 lineageUuid를 전달. 생략하면 서버가 새 lineage를 발급한다.',
    format: 'uuid',
    example: 'f0123456-7890-abcd-ef01-234567890abc',
  })
  @IsOptional()
  @IsUUID()
  lineageUuid?: string;

  @ApiProperty({
    description: '루틴 제목 (1~200자)',
    example: '아침 운동',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  title!: string;

  @ApiProperty({
    description:
      '반복 종류. day_of_week=특정 요일 반복, week=N주마다, day=N일마다.',
    enum: RoutineRepeatKindDto,
    example: RoutineRepeatKindDto.day_of_week,
  })
  @IsEnum(RoutineRepeatKindDto)
  repeatKind!: RoutineRepeatKindDto;

  @ApiPropertyOptional({
    description:
      'repeatKind=day_of_week일 때 필수, 그 외에는 금지. ISO 8601 요일 (1=월, 7=일). 1~7개.',
    example: [1, 3, 5],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  repeatWeekdays?: number[];

  @ApiPropertyOptional({
    description:
      'repeatKind=week 또는 day일 때 필수, day_of_week에서는 금지. 양의 정수.',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  repeatInterval?: number;

  @ApiProperty({
    description: '기준 날짜 (YYYY-MM-DD). 반복 계산의 anchor.',
    example: '2026-05-20',
  })
  @IsDateString()
  anchorDate!: string;

  @ApiProperty({
    description: '시작 시각 (HH:mm:ss).',
    example: '07:00:00',
  })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, {
    message: 'startTime must be in HH:mm:ss format',
  })
  startTime!: string;

  @ApiProperty({
    description: '지속 시간 (초). 양의 정수.',
    example: 3600,
  })
  @IsInt()
  @IsPositive()
  durationSec!: number;
}
