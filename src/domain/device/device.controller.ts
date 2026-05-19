import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import type { CurrentUserType } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { DeviceService } from './device.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { DeviceResponseDto } from './dto/response/device-response.dto';

@ApiTags('device')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post()
  @ApiOperation({
    summary: '디바이스 등록 / 갱신',
    description:
      '현재 유저에게 디바이스를 등록한다. 동일한 push_token이 이미 다른 유저에 등록된 경우 기존 등록을 비활성화하고 현재 유저로 이전한다. 이미 같은 토큰이 등록되어 있으면 갱신한다.',
  })
  @ApiCreatedResponse({
    description: '디바이스 등록 성공',
    type: DeviceResponseDto,
  })
  async register(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: RegisterDeviceDto,
  ): Promise<DeviceResponseDto> {
    const device = await this.deviceService.register(user.uuid, dto);
    return DeviceResponseDto.fromEntity(device);
  }

  @Delete(':pushToken')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '디바이스 비활성화',
    description:
      '지정한 push_token에 해당하는 디바이스를 비활성화한다. 해당 유저 소유의 토큰만 비활성화된다.',
  })
  @ApiNoContentResponse({ description: '비활성화 성공' })
  @ApiErrorResponse({
    status: 404,
    errorCode: ErrorCode.DEVICE_NOT_FOUND,
  })
  async deactivate(
    @CurrentUser() user: CurrentUserType,
    @Param('pushToken') pushToken: string,
  ): Promise<void> {
    await this.deviceService.deactivate(user.uuid, pushToken);
  }
}
