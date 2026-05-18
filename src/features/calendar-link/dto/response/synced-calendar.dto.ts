import { ApiProperty } from '@nestjs/swagger';
import { CalendarSyncedCalendars } from '@/generated/prisma/client';

export class SyncedCalendarResponseDto {
  @ApiProperty({
    description: 'synced calendar UUID',
    example: '6f1c2d18-...',
    format: 'uuid',
  })
  uuid!: string;

  @ApiProperty({ description: 'Google calendar ID', example: 'primary' })
  externalCalendarId!: string;

  @ApiProperty({
    description: '캘린더 표시 이름',
    example: 'leeseoyul@gmail.com',
    nullable: true,
    required: false,
  })
  summary!: string | null;

  @ApiProperty({ description: '활성 구독 여부', example: true })
  isActive!: boolean;

  @ApiProperty({
    description: '마지막 동기화 시각',
    example: '2026-05-18T10:00:00.000Z',
    format: 'date-time',
    nullable: true,
    required: false,
  })
  lastSyncedAt!: Date | null;

  static fromEntity(c: CalendarSyncedCalendars): SyncedCalendarResponseDto {
    const dto = new SyncedCalendarResponseDto();
    dto.uuid = c.uuid;
    dto.externalCalendarId = c.externalCalendarId;
    dto.summary = c.summary;
    dto.isActive = c.isActive;
    dto.lastSyncedAt = c.lastSyncedAt;
    return dto;
  }
}
