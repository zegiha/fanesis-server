import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { SendPushDto } from './dto/send-push.dto';
import { SendPushResponseDto } from './dto/send-push-response.dto';
import { PushNotificationService } from './push-notification.service';

@ApiTags('push-notification')
@ApiBearerAuth('access-token')
// TODO(prod): JwtAuthGuard는 개발/테스트 편의를 위한 임시 조치다.
// 프로덕션 배포 전 별도 AdminGuard(API Key 또는 내부 네트워크 제한)로 교체할 것.
@UseGuards(JwtAuthGuard)
@Controller('push-notifications')
export class PushNotificationController {
  constructor(private readonly pushService: PushNotificationService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '푸시 알림 수동 발송 (어드민/테스트용)',
    description:
      '지정한 유저의 모든 활성 디바이스에 푸시 알림을 발송한다. silent=true면 background push, false면 alert push.',
  })
  @ApiOkResponse({
    description: '큐에 투입된 job 수',
    type: SendPushResponseDto,
  })
  async sendPush(@Body() dto: SendPushDto): Promise<SendPushResponseDto> {
    const options = dto.silent
      ? { silent: true as const, payload: dto.payload }
      : {
          silent: false as const,
          title: dto.title!,
          body: dto.body!,
          payload: dto.payload,
        };
    const jobsEnqueued = await this.pushService.sendToUser(
      dto.userUuid,
      options,
    );
    return { jobsEnqueued };
  }
}
