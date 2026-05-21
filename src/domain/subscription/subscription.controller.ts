import {
  Body,
  Controller,
  Get,
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
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import type { CurrentUserType } from '@/core/auth/decorators/current-user.decorator';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { AppleVerifyDto } from './dto/apple-verify.dto';
import { SubscriptionResponseDto } from './dto/response/subscription-response.dto';
import { SubscriptionService } from './subscription.service';

@ApiTags('subscription')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('me')
  @ApiOperation({
    summary: '내 구독 상태 조회',
    description:
      '현재 로그인 유저의 활성 구독(trialing·active·past_due)을 반환한다. ' +
      '구독이 없으면 status: "none"을 반환한다.',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  getMySubscription(
    @CurrentUser() user: CurrentUserType,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionService.getMySubscription(user.uuid);
  }

  @Post('apple/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apple IAP 구독 검증',
    description:
      'StoreKit 2 JWS 트랜잭션을 검증하고 구독 정보를 저장한다. ' +
      '신규 구매와 구독 복원(restore) 모두 이 엔드포인트를 사용한다.',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiErrorResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    errorCode: ErrorCode.SUBSCRIPTION_JWS_VERIFICATION_FAILED,
  })
  @ApiErrorResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    errorCode: ErrorCode.SUBSCRIPTION_INVALID_PRODUCT_TYPE,
  })
  verifyApplePurchase(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: AppleVerifyDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionService.verifyAndSave(
      user.uuid,
      dto.jwsTransaction,
    );
  }
}
