import { ApiProperty } from '@nestjs/swagger';
import { Subscriptions } from '@/generated/prisma/client';

export class SubscriptionResponseDto {
  @ApiProperty({
    description: '구독 UUID',
    format: 'uuid',
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  uuid!: string | null;

  @ApiProperty({
    description: '구독 상태. 구독 없으면 none.',
    example: 'active',
    enum: ['none', 'trialing', 'active', 'past_due', 'canceled', 'expired'],
  })
  status!: string;

  @ApiProperty({ description: '구독 플랫폼', example: 'ios', nullable: true })
  platform!: string | null;

  @ApiProperty({
    description: '현재 구독 기간 시작',
    format: 'date-time',
    nullable: true,
    example: null,
  })
  currentPeriodStart!: Date | null;

  @ApiProperty({
    description: '현재 구독 기간 종료',
    format: 'date-time',
    nullable: true,
    example: null,
  })
  currentPeriodEnd!: Date | null;

  @ApiProperty({
    description: 'App Store 상품 ID',
    example: 'pro_monthly',
    nullable: true,
  })
  externalProductId!: string | null;

  @ApiProperty({
    description: '취소 일시',
    format: 'date-time',
    nullable: true,
    example: null,
  })
  canceledAt!: Date | null;

  @ApiProperty({
    description: '구독 생성 일시',
    format: 'date-time',
    nullable: true,
    example: null,
  })
  createdAt!: Date | null;

  static fromEntity(sub: Subscriptions): SubscriptionResponseDto {
    const dto = new SubscriptionResponseDto();
    dto.uuid = sub.uuid;
    dto.status = sub.status;
    dto.platform = sub.platform;
    dto.currentPeriodStart = sub.currentPeriodStart;
    dto.currentPeriodEnd = sub.currentPeriodEnd;
    dto.externalProductId = sub.externalProductId;
    dto.canceledAt = sub.canceledAt;
    dto.createdAt = sub.createdAt;
    return dto;
  }

  static none(): SubscriptionResponseDto {
    const dto = new SubscriptionResponseDto();
    dto.uuid = null;
    dto.status = 'none';
    dto.platform = null;
    dto.currentPeriodStart = null;
    dto.currentPeriodEnd = null;
    dto.externalProductId = null;
    dto.canceledAt = null;
    dto.createdAt = null;
    return dto;
  }
}
