import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';

export class RoutineNotFoundException extends AppException {
  constructor() {
    super(
      ErrorCode.ROUTINE_NOT_FOUND,
      'Routine not found',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class RoutineInvalidStateException extends AppException {
  constructor(message: string) {
    super(ErrorCode.ROUTINE_INVALID_STATE, message, HttpStatus.BAD_REQUEST);
  }
}

export class RoutineLineageNotFoundException extends AppException {
  constructor() {
    super(
      ErrorCode.ROUTINE_LINEAGE_NOT_FOUND,
      'No routine in this lineage exists for the current user',
      HttpStatus.BAD_REQUEST,
    );
  }
}
