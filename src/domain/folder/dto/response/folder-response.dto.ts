import { ApiProperty } from '@nestjs/swagger';
import { Folders } from '@/generated/prisma/client';
import { AccentColorKeyDto } from '../create-folder.dto';

export class FolderResponseDto {
  @ApiProperty({
    description: '폴더 고유 식별자 (UUID v4)',
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

  @ApiProperty({ description: '폴더 이름', example: '운동' })
  name!: string;

  @ApiProperty({
    description: '폴더 강조 색상',
    enum: AccentColorKeyDto,
    example: AccentColorKeyDto.blue,
  })
  color!: AccentColorKeyDto;

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

  static fromEntity(folder: Folders): FolderResponseDto {
    const dto = new FolderResponseDto();
    dto.uuid = folder.uuid;
    dto.userUuid = folder.userUuid;
    dto.name = folder.name;
    dto.color = folder.color as unknown as AccentColorKeyDto;
    dto.createdAt = folder.createdAt;
    dto.updatedAt = folder.updatedAt;
    return dto;
  }
}
