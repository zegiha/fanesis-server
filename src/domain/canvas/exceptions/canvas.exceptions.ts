import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';

export class CanvasNotFoundException extends AppException {
  constructor() {
    super(ErrorCode.CANVAS_NOT_FOUND, 'Canvas not found', HttpStatus.NOT_FOUND);
  }
}

export class CanvasVersionTokenInvalidException extends AppException {
  constructor() {
    super(
      ErrorCode.CANVAS_VERSION_TOKEN_INVALID,
      'Canvas version token is invalid',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class CanvasVersionTokenExpiredException extends AppException {
  constructor() {
    super(
      ErrorCode.CANVAS_VERSION_TOKEN_EXPIRED,
      'Canvas version token has expired',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class CanvasUploadNotConfirmedException extends AppException {
  constructor() {
    super(
      ErrorCode.CANVAS_UPLOAD_NOT_CONFIRMED,
      'Canvas file not found in storage — upload not confirmed',
      HttpStatus.CONFLICT,
    );
  }
}

export class CanvasFileTooLargeException extends AppException {
  constructor() {
    super(
      ErrorCode.CANVAS_FILE_TOO_LARGE,
      'Canvas file exceeds the 50 MB size limit',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
