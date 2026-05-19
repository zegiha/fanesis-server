import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Devices } from '@/generated/prisma/client';

export class DeviceResponseDto {
  @ApiProperty({
    description: '디바이스 고유 식별자 (UUID v4)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    format: 'uuid',
  })
  uuid!: string;

  @ApiProperty({
    description: '디바이스를 소유한 유저의 UUID',
    example: '6f1c2d18-2b1e-4d6a-8a8a-2a3f6f9c1b22',
    format: 'uuid',
  })
  userUuid!: string;

  @ApiProperty({
    description: 'APNs 또는 FCM 푸시 토큰',
    example:
      'apns_token_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  })
  pushToken!: string;

  @ApiPropertyOptional({
    description: '디바이스 이름 (사용자가 설정한 기기 이름)',
    example: '홍길동의 iPhone',
    nullable: true,
  })
  deviceName!: string | null;

  @ApiPropertyOptional({
    description: '디바이스 모델명',
    example: 'iPhone 15 Pro',
    nullable: true,
  })
  deviceModel!: string | null;

  @ApiPropertyOptional({
    description: '앱 버전',
    example: '1.2.3',
    nullable: true,
  })
  appVersion!: string | null;

  @ApiPropertyOptional({
    description: 'OS 버전',
    example: '17.4.1',
    nullable: true,
  })
  osVersion!: string | null;

  @ApiProperty({
    description: '디바이스 활성 여부',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description: '마지막 활성 시각 (ISO 8601)',
    example: '2026-05-19T10:00:00.000Z',
    format: 'date-time',
  })
  lastActiveAt!: Date;

  @ApiProperty({
    description: '디바이스 등록 시각 (ISO 8601)',
    example: '2026-05-19T10:00:00.000Z',
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    description: '디바이스 정보 마지막 수정 시각 (ISO 8601)',
    example: '2026-05-19T10:00:00.000Z',
    format: 'date-time',
  })
  updatedAt!: Date;

  static fromEntity(d: Devices): DeviceResponseDto {
    const dto = new DeviceResponseDto();
    dto.uuid = d.uuid;
    dto.userUuid = d.userUuid;
    dto.pushToken = d.pushToken;
    dto.deviceName = d.deviceName;
    dto.deviceModel = d.deviceModel;
    dto.appVersion = d.appVersion;
    dto.osVersion = d.osVersion;
    dto.isActive = d.isActive;
    dto.lastActiveAt = d.lastActiveAt;
    dto.createdAt = d.createdAt;
    dto.updatedAt = d.updatedAt;
    return dto;
  }
}
