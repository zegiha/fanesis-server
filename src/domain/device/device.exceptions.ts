import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';

export class DeviceNotFoundException extends AppException {
  constructor() {
    super(ErrorCode.DEVICE_NOT_FOUND, 'Device not found', HttpStatus.NOT_FOUND);
  }
}
