import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';

export class FocusSessionNotFoundException extends AppException {
  constructor() {
    super(
      ErrorCode.FOCUS_SESSION_NOT_FOUND,
      'Focus session not found',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class FocusSessionAlreadyActiveException extends AppException {
  constructor() {
    super(
      ErrorCode.FOCUS_SESSION_ALREADY_ACTIVE,
      'Another focus session is already active for this user',
      HttpStatus.CONFLICT,
    );
  }
}

export class FocusSessionAlreadyEndedException extends AppException {
  constructor() {
    super(
      ErrorCode.FOCUS_SESSION_ALREADY_ENDED,
      'Focus session has already ended',
      HttpStatus.CONFLICT,
    );
  }
}
