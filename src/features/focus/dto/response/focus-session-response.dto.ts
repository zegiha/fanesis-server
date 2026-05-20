import { ApiProperty } from '@nestjs/swagger';
import { FocusSessions } from '@/generated/prisma/client';
import { FocusSessionKindDto } from '../start-focus-session.dto';

export class FocusSessionResponseDto {
  @ApiProperty({
    description: '세션 고유 식별자 (UUID v4).',
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
    description: '세션 종류.',
    enum: FocusSessionKindDto,
    example: FocusSessionKindDto.focus,
  })
  kind!: FocusSessionKindDto;

  @ApiProperty({
    description:
      '연결된 task UUID. 세션 시작 시점에는 항상 값이 있으나, task가 삭제되면 ON DELETE SET NULL로 null이 된다.',
    example: '11111111-2222-3333-4444-555555555555',
    format: 'uuid',
    nullable: true,
    required: false,
  })
  taskUuid!: string | null;

  @ApiProperty({
    description: '시작 시각 (ISO 8601).',
    example: '2026-05-20T01:23:45.000Z',
    format: 'date-time',
  })
  startedAt!: Date;

  @ApiProperty({
    description: '종료 시각 (ISO 8601). null이면 진행 중.',
    example: '2026-05-20T01:53:45.000Z',
    format: 'date-time',
    nullable: true,
    required: false,
  })
  endedAt!: Date | null;

  @ApiProperty({
    description: '레코드 생성 시각 (ISO 8601).',
    example: '2026-05-20T01:23:45.000Z',
    format: 'date-time',
  })
  createdAt!: Date;

  static fromEntity(s: FocusSessions): FocusSessionResponseDto {
    const dto = new FocusSessionResponseDto();
    dto.uuid = s.uuid;
    dto.userUuid = s.userUuid;
    dto.kind = s.kind as unknown as FocusSessionKindDto;
    dto.taskUuid = s.taskUuid;
    dto.startedAt = s.startedAt;
    dto.endedAt = s.endedAt;
    dto.createdAt = s.createdAt;
    return dto;
  }
}
