import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';

export class InvalidGoogleTokenException extends AppException {
  constructor() {
    super(
      ErrorCode.AUTH_INVALID_GOOGLE_TOKEN,
      'Invalid Google token',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class InvalidTokenTypeException extends AppException {
  constructor() {
    super(
      ErrorCode.AUTH_INVALID_TOKEN_TYPE,
      'Invalid token type',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class InvalidRefreshTokenException extends AppException {
  constructor() {
    super(
      ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
      'Invalid refresh token',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
