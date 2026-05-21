import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SubscriptionService } from '../subscription.service';

@ApiExcludeController()
@Controller('webhook')
export class AppleWebhookController {
  private readonly logger = new Logger(AppleWebhookController.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  async handleAppleNotification(
    @Body() body: { signedPayload: string },
  ): Promise<void> {
    try {
      await this.subscriptionService.handleAppleNotification(
        body.signedPayload,
      );
    } catch (err) {
      // Apple은 2xx를 받지 못하면 최대 24시간 재전송한다.
      // 처리 실패는 로깅만 하고 200을 반환해 무한 재전송을 방지한다.
      this.logger.error(
        'Apple webhook processing failed',
        (err as Error).stack,
      );
    }
  }
}
