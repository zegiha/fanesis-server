import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';

export class TaskNotFoundException extends AppException {
  constructor() {
    super(ErrorCode.TASK_NOT_FOUND, 'Task not found', HttpStatus.NOT_FOUND);
  }
}

export class TaskInvalidStateException extends AppException {
  constructor(message = 'Task state is invalid') {
    super(ErrorCode.TASK_INVALID_STATE, message, HttpStatus.BAD_REQUEST);
  }
}

export class TaskBig3LimitExceededException extends AppException {
  constructor() {
    super(
      ErrorCode.TASK_BIG3_LIMIT_EXCEEDED,
      'big3 task limit (max 3 per day) exceeded',
      HttpStatus.CONFLICT,
    );
  }
}

export class FolderNotFoundException extends AppException {
  constructor() {
    super(ErrorCode.FOLDER_NOT_FOUND, 'Folder not found', HttpStatus.NOT_FOUND);
  }
}
