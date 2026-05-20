import { ApiProperty } from '@nestjs/swagger';
import { TermsKind } from '@/generated/prisma/enums';

export enum TermsKindDto {
  service = 'service',
  privacy = 'privacy',
  marketing = 'marketing',
}

export interface LatestTermsEntity {
  uuid: string;
  kind: TermsKind;
  version: number;
  isRequired: boolean;
  effectiveAt: Date;
  content: string | null;
  contentLanguage: string | null;
  agreed: boolean;
}

export class LatestTermsResponseDto {
  @ApiProperty({
    description: '약관 고유 식별자 (UUID v4)',
    example: '6f1c2d18-2b1e-4d6a-8a8a-2a3f6f9c1b22',
    format: 'uuid',
  })
  uuid!: string;

  @ApiProperty({
    description: '약관 종류',
    enum: TermsKindDto,
    example: TermsKindDto.service,
  })
  kind!: TermsKindDto;

  @ApiProperty({
    description: '약관 버전 (양의 정수)',
    example: 1,
  })
  version!: number;

  @ApiProperty({
    description: '필수 동의 여부',
    example: true,
  })
  isRequired!: boolean;

  @ApiProperty({
    description: '약관 발효 일시 (ISO 8601)',
    example: '2026-05-20T00:00:00.000Z',
    format: 'date-time',
  })
  effectiveAt!: Date;

  @ApiProperty({
    description:
      '약관 본문. 언어 우선순위는 query.language → users.language → en fallback. 셋 다 없으면 null.',
    example: '서비스 이용 약관 본문...',
    nullable: true,
    required: false,
  })
  content!: string | null;

  @ApiProperty({
    description:
      '반환된 content의 실제 언어 코드 (primary 또는 en fallback). content가 null이면 null.',
    example: 'ko',
    nullable: true,
    required: false,
  })
  contentLanguage!: string | null;

  @ApiProperty({
    description: '사용자의 가장 최근 동의 이력 값. 이력이 없으면 false.',
    example: false,
  })
  agreed!: boolean;

  static fromEntity(entity: LatestTermsEntity): LatestTermsResponseDto {
    const dto = new LatestTermsResponseDto();
    dto.uuid = entity.uuid;
    dto.kind = entity.kind as unknown as TermsKindDto;
    dto.version = entity.version;
    dto.isRequired = entity.isRequired;
    dto.effectiveAt = entity.effectiveAt;
    dto.content = entity.content;
    dto.contentLanguage = entity.contentLanguage;
    dto.agreed = entity.agreed;
    return dto;
  }
}
