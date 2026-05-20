import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { TermsKind } from '@/generated/prisma/enums';

export class TermsNotFoundException extends AppException {
  constructor() {
    super(ErrorCode.TERMS_NOT_FOUND, 'Terms not found', HttpStatus.NOT_FOUND);
  }
}

export class RequiredTermsNotAgreedException extends AppException {
  constructor(
    missingTerms: Array<{ uuid: string; kind: TermsKind; version: number }>,
  ) {
    super(
      ErrorCode.REQUIRED_TERMS_NOT_AGREED,
      'Required terms not agreed',
      HttpStatus.FORBIDDEN,
    );
    this.extras = { missingTerms };
  }
}
