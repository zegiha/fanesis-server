import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';

export class SubscriptionJwsVerificationFailedException extends AppException {
  constructor() {
    super(
      ErrorCode.SUBSCRIPTION_JWS_VERIFICATION_FAILED,
      'Apple JWS transaction verification failed',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class SubscriptionInvalidProductTypeException extends AppException {
  constructor() {
    super(
      ErrorCode.SUBSCRIPTION_INVALID_PRODUCT_TYPE,
      'Only auto-renewable subscriptions are supported',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class SubscriptionNotFoundException extends AppException {
  constructor() {
    super(
      ErrorCode.SUBSCRIPTION_NOT_FOUND,
      'Subscription not found',
      HttpStatus.NOT_FOUND,
    );
  }
}
