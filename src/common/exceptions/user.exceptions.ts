import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';

export class UserNotFoundException extends AppException {
  constructor() {
    super(ErrorCode.USER_NOT_FOUND, 'User not found', HttpStatus.NOT_FOUND);
  }
}
