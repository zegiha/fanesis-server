import { ApiProperty } from '@nestjs/swagger';
import { Tasks } from '@/generated/prisma/client';
import {
  TaskActiveKindDto,
  TaskAffiliationDto,
  TaskBacklogKindDto,
  TaskPriorityDto,
  TaskTimeboxKindDto,
} from '../create-task.dto';

export class TaskResponseDto {
  @ApiProperty({
    description: '태스크 고유 식별자 (UUID v4)',
    example: '6f1c2d18-2b1e-4d6a-8a8a-2a3f6f9c1b22',
    format: 'uuid',
  })
  uuid!: string;

  @ApiProperty({
    description: '소유 유저 UUID',
    example: '11111111-2222-3333-4444-555555555555',
    format: 'uuid',
  })
  userUuid!: string;

  @ApiProperty({ description: '태스크 제목', example: '운동하기' })
  title!: string;

  @ApiProperty({
    description: '우선순위',
    enum: TaskPriorityDto,
    example: TaskPriorityDto.high,
    nullable: true,
    required: false,
  })
  priority!: TaskPriorityDto | null;

  @ApiProperty({
    description: '외부 출처',
    enum: TaskAffiliationDto,
    example: TaskAffiliationDto.google,
    nullable: true,
    required: false,
  })
  affiliation!: TaskAffiliationDto | null;

  @ApiProperty({
    description: 'backlog 단계 종류',
    enum: TaskBacklogKindDto,
    example: TaskBacklogKindDto.inbox,
  })
  backlogKind!: TaskBacklogKindDto;

  @ApiProperty({
    description: 'backlog로 사용된 폴더 UUID',
    example: '6f1c2d18-2b1e-4d6a-8a8a-2a3f6f9c1b22',
    format: 'uuid',
    nullable: true,
    required: false,
  })
  backlogFolderId!: string | null;

  @ApiProperty({
    description: 'active 단계 종류',
    enum: TaskActiveKindDto,
    example: TaskActiveKindDto.todo,
    nullable: true,
    required: false,
  })
  activeKind!: TaskActiveKindDto | null;

  @ApiProperty({
    description: 'timebox 단계 종류',
    enum: TaskTimeboxKindDto,
    example: TaskTimeboxKindDto.timeline,
    nullable: true,
    required: false,
  })
  timeboxKind!: TaskTimeboxKindDto | null;

  @ApiProperty({
    description: '예약 날짜 (YYYY-MM-DD)',
    example: '2026-05-17',
    nullable: true,
    required: false,
  })
  scheduledDate!: string | null;

  @ApiProperty({
    description: '시작 시각 (HH:mm:ss)',
    example: '09:30:00',
    nullable: true,
    required: false,
  })
  startTime!: string | null;

  @ApiProperty({
    description: '전체 소요 시간 (초)',
    example: 3600,
    nullable: true,
    required: false,
  })
  durationSec!: number | null;

  @ApiProperty({
    description: '집중 청크 시간 (초)',
    example: 1500,
    nullable: true,
    required: false,
  })
  chunkSec!: number | null;

  @ApiProperty({
    description: '청크 사이 휴식 시간 (초)',
    example: 300,
    nullable: true,
    required: false,
  })
  breakSec!: number | null;

  @ApiProperty({
    description: '완료 시각 (ISO 8601). 미완료 시 null.',
    example: '2026-05-17T10:30:00.000Z',
    format: 'date-time',
    nullable: true,
    required: false,
  })
  doneDate!: Date | null;

  @ApiProperty({
    description: '생성 시각 (ISO 8601)',
    example: '2026-05-17T01:23:45.000Z',
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    description: '마지막 수정 시각 (ISO 8601)',
    example: '2026-05-17T01:23:45.000Z',
    format: 'date-time',
  })
  updatedAt!: Date;

  static fromEntity(task: Tasks): TaskResponseDto {
    const dto = new TaskResponseDto();
    dto.uuid = task.uuid;
    dto.userUuid = task.userUuid;
    dto.title = task.title;
    dto.priority = task.priority as TaskPriorityDto | null;
    dto.affiliation = task.affiliation as TaskAffiliationDto | null;
    dto.backlogKind = task.backlogKind as unknown as TaskBacklogKindDto;
    dto.backlogFolderId = task.backlogFolderId;
    dto.activeKind = task.activeKind as TaskActiveKindDto | null;
    dto.timeboxKind = task.timeboxKind as TaskTimeboxKindDto | null;
    dto.scheduledDate = task.scheduledDate
      ? task.scheduledDate.toISOString().slice(0, 10)
      : null;
    dto.startTime = task.startTime
      ? task.startTime.toISOString().slice(11, 19)
      : null;
    dto.durationSec = task.durationSec;
    dto.chunkSec = task.chunkSec;
    dto.breakSec = task.breakSec;
    dto.doneDate = task.doneDate;
    dto.createdAt = task.createdAt;
    dto.updatedAt = task.updatedAt;
    return dto;
  }
}
