import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';

export class FolderNotFoundException extends AppException {
  constructor() {
    super(ErrorCode.FOLDER_NOT_FOUND, 'Folder not found', HttpStatus.NOT_FOUND);
  }
}

export class FolderNameDuplicatedException extends AppException {
  constructor() {
    super(
      ErrorCode.FOLDER_NAME_DUPLICATED,
      'Folder name already exists for this user',
      HttpStatus.CONFLICT,
    );
  }
}
