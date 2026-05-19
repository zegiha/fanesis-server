import { ApiProperty } from '@nestjs/swagger';

interface CanvasEntity {
  uuid: string;
  date: Date;
  version: string;
  storageKey: string;
  updatedAt: Date;
}

export class CanvasResponseDto {
  @ApiProperty({
    description: '캔버스 UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  uuid!: string;

  @ApiProperty({
    description: '캔버스 날짜 (YYYY-MM-DD)',
    example: '2026-05-19',
    format: 'date',
  })
  date!: string;

  @ApiProperty({
    description: '캔버스 버전 문자열 (예: v1.abc123)',
    example: 'v1.abc123XY',
  })
  version!: string;

  @ApiProperty({
    description: 'R2 스토리지 오브젝트 키',
    example: 'canvases/user-uuid/2026-05-19/abc123XY.bin',
  })
  storageKey!: string;

  @ApiProperty({
    description: '마지막 업데이트 일시',
    example: '2026-05-19T12:00:00.000Z',
    format: 'date-time',
  })
  updatedAt!: Date;

  static fromEntity(entity: CanvasEntity): CanvasResponseDto {
    const dto = new CanvasResponseDto();
    dto.uuid = entity.uuid;
    dto.date = entity.date.toISOString().slice(0, 10);
    dto.version = entity.version;
    dto.storageKey = entity.storageKey;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
