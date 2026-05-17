import { applyDecorators } from '@nestjs/common';
import { ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dtos/error-response.dto';
import { ErrorCode } from '../exceptions/error-codes';

interface ApiErrorResponseOptions {
  status: number;
  errorCode: ErrorCode;
  description?: string;
  /** 응답 message 필드 예시. 생략 시 description 또는 errorCode 사용. */
  messageExample?: string;
}

/**
 * 컨트롤러 엔드포인트에 도메인 에러 응답을 문서화한다.
 * 기본 400/401/500은 main.ts에서 글로벌로 모든 operation에 자동 첨부되므로,
 * 이 데코레이터는 endpoint 고유의 에러(404, 409 등)에 사용한다.
 *
 * 예) @ApiErrorResponse({ status: 401, errorCode: ErrorCode.AUTH_INVALID_GOOGLE_TOKEN })
 */
export const ApiErrorResponse = ({
  status,
  errorCode,
  description,
  messageExample,
}: ApiErrorResponseOptions) =>
  applyDecorators(
    ApiResponse({
      status,
      description: description ?? errorCode,
      schema: {
        allOf: [{ $ref: getSchemaPath(ErrorResponseDto) }],
        example: {
          statusCode: status,
          message: messageExample ?? description ?? errorCode,
          error: errorCode,
          errorCode,
          timestamp: new Date().toISOString(),
          path: '/example/path',
        },
      },
    }),
  );
