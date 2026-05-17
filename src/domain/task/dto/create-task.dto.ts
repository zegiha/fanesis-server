import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';

export enum TaskPriorityDto {
  high = 'high',
  medium = 'medium',
  low = 'low',
}

export enum TaskAffiliationDto {
  google = 'google',
}

export enum TaskBacklogKindDto {
  inbox = 'inbox',
  folder = 'folder',
}

export enum TaskActiveKindDto {
  todo = 'todo',
  big3 = 'big3',
}

export enum TaskTimeboxKindDto {
  timeline = 'timeline',
}

export class CreateTaskDto {
  @ApiProperty({ description: '태스크 제목', example: '운동하기' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({
    description: '우선순위',
    enum: TaskPriorityDto,
    example: TaskPriorityDto.high,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsEnum(TaskPriorityDto)
  priority?: TaskPriorityDto;

  @ApiProperty({
    description: '외부 출처 (Google 캘린더에서 가져온 경우 등)',
    enum: TaskAffiliationDto,
    example: TaskAffiliationDto.google,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsEnum(TaskAffiliationDto)
  affiliation?: TaskAffiliationDto;

  @ApiProperty({
    description: 'backlog 단계 종류. folder인 경우 backlogFolderId 필수.',
    enum: TaskBacklogKindDto,
    example: TaskBacklogKindDto.inbox,
  })
  @IsEnum(TaskBacklogKindDto)
  backlogKind!: TaskBacklogKindDto;

  @ApiProperty({
    description: 'backlog로 사용할 폴더 UUID. backlogKind=folder일 때만 허용.',
    example: '6f1c2d18-2b1e-4d6a-8a8a-2a3f6f9c1b22',
    format: 'uuid',
    nullable: true,
    required: false,
  })
  @ValidateIf(
    (o: CreateTaskDto) =>
      o.backlogKind === TaskBacklogKindDto.folder ||
      o.backlogFolderId !== undefined,
  )
  @IsUUID()
  backlogFolderId?: string;

  @ApiProperty({
    description: 'active 단계 종류',
    enum: TaskActiveKindDto,
    example: TaskActiveKindDto.todo,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsEnum(TaskActiveKindDto)
  activeKind?: TaskActiveKindDto;

  @ApiProperty({
    description: 'timebox 단계 종류. active 단계가 설정된 경우에만 허용.',
    enum: TaskTimeboxKindDto,
    example: TaskTimeboxKindDto.timeline,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsEnum(TaskTimeboxKindDto)
  timeboxKind?: TaskTimeboxKindDto;

  @ApiProperty({
    description: '예약된 날짜 (YYYY-MM-DD). big3 active일 때 필수.',
    example: '2026-05-17',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'scheduledDate must be in YYYY-MM-DD format',
  })
  scheduledDate?: string;

  @ApiProperty({
    description: '시작 시각 (HH:mm:ss, 24h)',
    example: '09:30:00',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'startTime must be in HH:mm[:ss] format',
  })
  startTime?: string;

  @ApiProperty({
    description: '전체 소요 시간 (초)',
    example: 3600,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationSec?: number;

  @ApiProperty({
    description: '집중 청크 시간 (초). 설정 시 chunkSec ≤ durationSec.',
    example: 1500,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  chunkSec?: number;

  @ApiProperty({
    description: '청크 사이 휴식 시간 (초). chunkSec이 설정된 경우에만 허용.',
    example: 300,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  breakSec?: number;
}
