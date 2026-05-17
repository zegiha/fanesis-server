import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * 프로젝트 표준 예외 베이스 클래스.
 * 도메인별 커스텀 예외는 이 클래스를 상속해 errorCode/message/status를 고정한다.
 *
 * 예)
 *   export class TaskNotFoundException extends AppException {
 *     constructor() {
 *       super(ErrorCode.TASK_NOT_FOUND, 'Task not found', HttpStatus.NOT_FOUND);
 *     }
 *   }
 *
 * AllExceptionsFilter는 AppException 인스턴스를 감지해 응답 body에 errorCode를 포함시킨다.
 */
export class AppException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    statusCode: number,
  ) {
    super({ statusCode, message, error: errorCode }, statusCode);
  }
}
