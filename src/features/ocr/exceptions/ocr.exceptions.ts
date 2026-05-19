import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';

export class OcrTokenInvalidException extends AppException {
  constructor() {
    super(
      ErrorCode.OCR_TOKEN_INVALID,
      'OCR 토큰이 유효하지 않습니다',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class OcrTokenExpiredException extends AppException {
  constructor() {
    super(
      ErrorCode.OCR_TOKEN_EXPIRED,
      'OCR 토큰이 만료되었습니다',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class OcrImageInvalidTypeException extends AppException {
  constructor() {
    super(
      ErrorCode.OCR_IMAGE_INVALID_TYPE,
      'OCR 이미지의 Content-Type이 image/* 가 아닙니다',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class OcrImageEmptyException extends AppException {
  constructor() {
    super(
      ErrorCode.OCR_IMAGE_EMPTY,
      'OCR 이미지 파일이 비어 있습니다',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class OcrImageTooLargeException extends AppException {
  constructor() {
    super(
      ErrorCode.OCR_IMAGE_TOO_LARGE,
      'OCR 이미지가 20 MB 제한을 초과합니다',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
