import { ApiProperty } from '@nestjs/swagger';
import { TermsKind } from '@/generated/prisma/enums';

export class ErrorResponseDto {
  @ApiProperty({ description: 'HTTP 상태 코드', example: 400 })
  statusCode!: number;

  @ApiProperty({
    description:
      '에러 메시지. ValidationPipe 에러의 경우 문자열 배열로 반환됩니다.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Unauthorized',
  })
  message!: string | string[];

  @ApiProperty({
    description:
      'HTTP 상태 이름 또는 도메인 에러 코드 (AppException 사용 시 errorCode와 동일)',
    example: 'Unauthorized',
  })
  error!: string;

  @ApiProperty({
    description:
      '도메인 에러 코드. AppException을 통해 던진 커스텀 예외에만 포함되며, 클라이언트의 분기 처리에 사용한다.',
    example: 'AUTH_INVALID_GOOGLE_TOKEN',
    required: false,
  })
  errorCode?: string;

  @ApiProperty({
    description:
      '필수 약관 미동의 시 미동의 약관 목록 (REQUIRED_TERMS_NOT_AGREED 에러 시만 포함)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        uuid: { type: 'string', format: 'uuid' },
        kind: {
          type: 'string',
          enum: [TermsKind.service, TermsKind.privacy, TermsKind.marketing],
        },
        version: { type: 'integer', example: 1 },
      },
    },
    required: false,
    example: [
      {
        uuid: '0193abcd-ef01-7000-a000-000000000001',
        kind: 'service',
        version: 1,
      },
    ],
  })
  missingTerms?: Array<{ uuid: string; kind: TermsKind; version: number }>;

  @ApiProperty({
    description: '에러 발생 시각 (ISO 8601)',
    example: '2026-05-17T12:34:56.000Z',
  })
  timestamp!: string;

  @ApiProperty({ description: '요청 경로', example: '/auth/login' })
  path!: string;
}
