import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'APNs 또는 FCM 푸시 토큰 (64~200자)',
    example:
      'apns_token_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  })
  @IsString()
  @Length(64, 200)
  pushToken!: string;

  @ApiPropertyOptional({
    description: '디바이스 이름 (사용자가 설정한 기기 이름)',
    example: '홍길동의 iPhone',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({
    description: '디바이스 모델명',
    example: 'iPhone 15 Pro',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  deviceModel?: string;

  @ApiPropertyOptional({
    description: '앱 버전',
    example: '1.2.3',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional({
    description: 'OS 버전',
    example: '17.4.1',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  osVersion?: string;
}
