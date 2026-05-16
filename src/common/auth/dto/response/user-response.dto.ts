import { ApiProperty } from '@nestjs/swagger';
import { Users } from '../../../../generated/prisma/client';

export enum LanguageDto {
  ko = 'ko',
  en = 'en',
}

export class UserResponseDto {
  @ApiProperty({
    description: '유저 고유 식별자 (UUID v4)',
    example: '6f1c2d18-2b1e-4d6a-8a8a-2a3f6f9c1b22',
    format: 'uuid',
  })
  uuid!: string;

  @ApiProperty({
    description: '이메일 주소 (OAuth 제공자에서 제공). 미공개 계정의 경우 null',
    example: 'user@example.com',
    nullable: true,
    required: false,
  })
  email!: string | null;

  @ApiProperty({
    description: '표시 이름 (닉네임). 설정되지 않은 경우 null',
    example: '홍길동',
    nullable: true,
    required: false,
  })
  displayName!: string | null;

  @ApiProperty({
    description: '유저 언어 설정',
    enum: LanguageDto,
    example: LanguageDto.ko,
  })
  language!: LanguageDto;

  @ApiProperty({
    description: '유저 타임존 (IANA tz database)',
    example: 'Asia/Seoul',
  })
  timezone!: string;

  @ApiProperty({
    description: '계정 생성 시각 (ISO 8601)',
    example: '2026-05-17T01:23:45.000Z',
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    description: '계정 정보 마지막 수정 시각 (ISO 8601)',
    example: '2026-05-17T01:23:45.000Z',
    format: 'date-time',
  })
  updatedAt!: Date;

  static fromEntity(user: Users): UserResponseDto {
    const dto = new UserResponseDto();
    dto.uuid = user.uuid;
    dto.email = user.email;
    dto.displayName = user.displayName;
    dto.language = user.language as unknown as LanguageDto;
    dto.timezone = user.timezone;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
