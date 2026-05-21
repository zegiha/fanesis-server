import { Injectable, Logger } from '@nestjs/common';
import { NotificationTypeV2, Subtype } from '@apple/app-store-server-library';
import { PrismaService } from '@/core/prisma/prisma.service';
import {
  SubscriptionEventKind,
  SubscriptionPlatform,
  SubscriptionStatus,
  Subscriptions,
} from '@/generated/prisma/client';
import { AppleIapService } from './apple-iap.service';
import { SubscriptionResponseDto } from './dto/response/subscription-response.dto';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appleIap: AppleIapService,
  ) {}

  async getMySubscription(userUuid: string): Promise<SubscriptionResponseDto> {
    const sub = await this.prisma.subscriptions.findFirst({
      where: {
        userUuid,
        status: { in: ['trialing', 'active', 'past_due'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sub
      ? SubscriptionResponseDto.fromEntity(sub)
      : SubscriptionResponseDto.none();
  }

  async verifyAndSave(
    userUuid: string,
    jwsTransaction: string,
  ): Promise<SubscriptionResponseDto> {
    const decoded = await this.appleIap.verifyTransaction(jwsTransaction);

    const {
      originalTransactionId,
      productId,
      purchaseDate,
      expiresDate,
      offerType,
    } = decoded;

    const periodStart = purchaseDate ? new Date(purchaseDate) : null;
    const periodEnd = expiresDate ? new Date(expiresDate) : null;
    const now = new Date();
    const status: SubscriptionStatus =
      periodEnd && periodEnd > now ? 'active' : 'expired';

    // trial 여부: offerType 1 = Introductory Offer (무료 체험)
    const isTrial = offerType === 1;

    const sub = await this.upsertSubscription({
      userUuid,
      originalTransactionId: originalTransactionId ?? '',
      productId: productId ?? null,
      periodStart,
      periodEnd,
      status,
      isTrial,
    });

    return SubscriptionResponseDto.fromEntity(sub);
  }

  async handleAppleNotification(signedPayload: string): Promise<void> {
    const notification = await this.appleIap.verifyNotification(signedPayload);

    const { notificationType, subtype, data } = notification;
    if (!data?.signedTransactionInfo) return;

    const decoded = await this.appleIap.verifyTransaction(
      data.signedTransactionInfo,
    );

    const { originalTransactionId, productId, purchaseDate, expiresDate } =
      decoded;

    if (!originalTransactionId) return;

    const periodStart = purchaseDate ? new Date(purchaseDate) : null;
    const periodEnd = expiresDate ? new Date(expiresDate) : null;
    const now = new Date();

    const existing = await this.prisma.subscriptions.findFirst({
      where: { externalTransactionId: originalTransactionId },
    });

    if (!existing) {
      this.logger.warn(
        `No subscription found for originalTransactionId=${originalTransactionId}, notificationType=${notificationType}`,
      );
      return;
    }

    const eventKind = this.resolveEventKind(notificationType, subtype);
    const newStatus = this.resolveStatus(
      notificationType,
      subtype,
      periodEnd,
      now,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptions.update({
        where: { uuid: existing.uuid },
        data: {
          status: newStatus,
          currentPeriodStart: periodStart ?? existing.currentPeriodStart,
          currentPeriodEnd: periodEnd ?? existing.currentPeriodEnd,
          externalProductId: productId ?? existing.externalProductId,
          canceledAt:
            newStatus === 'canceled' || newStatus === 'expired'
              ? (existing.canceledAt ?? now)
              : existing.canceledAt,
        },
      });

      if (eventKind) {
        await tx.subscriptionEvents.create({
          data: {
            subscriptionUuid: existing.uuid,
            userUuid: existing.userUuid,
            kind: eventKind,
            occurredAt: now,
            metadata: JSON.parse(JSON.stringify(notification)) as object,
          },
        });
      }
    });
  }

  private async upsertSubscription(params: {
    userUuid: string;
    originalTransactionId: string;
    productId: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    status: SubscriptionStatus;
    isTrial: boolean;
  }): Promise<Subscriptions> {
    const {
      userUuid,
      originalTransactionId,
      productId,
      periodStart,
      periodEnd,
      status,
      isTrial,
    } = params;
    const now = new Date();

    const existing = await this.prisma.subscriptions.findFirst({
      where: { externalTransactionId: originalTransactionId },
    });

    if (existing) {
      // 갱신: 기간과 상태만 업데이트
      const updated = await this.prisma.$transaction(async (tx) => {
        const sub = await tx.subscriptions.update({
          where: { uuid: existing.uuid },
          data: {
            status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            externalProductId: productId,
          },
        });
        await tx.subscriptionEvents.create({
          data: {
            subscriptionUuid: sub.uuid,
            userUuid,
            kind: 'renewed',
            occurredAt: now,
          },
        });
        return sub;
      });
      return updated;
    }

    // 신규: 부분 unique 충돌(P2002) 가능성 있음 → 충돌 시 기존 활성 구독 만료 후 재생성
    try {
      return await this.prisma.$transaction(async (tx) => {
        const sub = await tx.subscriptions.create({
          data: {
            userUuid,
            status,
            platform: SubscriptionPlatform.ios,
            trialStartAt: isTrial ? now : null,
            trialEndAt: isTrial ? periodEnd : null,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            externalProductId: productId,
            externalTransactionId: originalTransactionId,
          },
        });
        await tx.subscriptionEvents.create({
          data: {
            subscriptionUuid: sub.uuid,
            userUuid,
            kind: isTrial
              ? SubscriptionEventKind.trial_started
              : SubscriptionEventKind.trial_converted,
            occurredAt: now,
          },
        });
        return sub;
      });
    } catch (err: unknown) {
      // P2002 = unique constraint 위반 (활성 구독 partial unique 충돌)
      if ((err as { code?: string }).code !== 'P2002') throw err;

      return await this.prisma.$transaction(async (tx) => {
        // 기존 활성 구독을 만료 처리
        await tx.subscriptions.updateMany({
          where: {
            userUuid,
            status: { in: ['trialing', 'active', 'past_due'] },
          },
          data: { status: 'expired' },
        });
        const sub = await tx.subscriptions.create({
          data: {
            userUuid,
            status,
            platform: SubscriptionPlatform.ios,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            externalProductId: productId,
            externalTransactionId: originalTransactionId,
          },
        });
        await tx.subscriptionEvents.create({
          data: {
            subscriptionUuid: sub.uuid,
            userUuid,
            kind: SubscriptionEventKind.trial_converted,
            occurredAt: now,
          },
        });
        return sub;
      });
    }
  }

  private resolveEventKind(
    notificationType?: string,
    subtype?: string,
  ): SubscriptionEventKind | null {
    switch (notificationType) {
      case NotificationTypeV2.SUBSCRIBED:
        return SubscriptionEventKind.trial_started;
      case NotificationTypeV2.DID_RENEW:
        return SubscriptionEventKind.renewed;
      case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
        if (subtype === Subtype.AUTO_RENEW_DISABLED)
          return SubscriptionEventKind.canceled;
        if (subtype === Subtype.AUTO_RENEW_ENABLED)
          return SubscriptionEventKind.reactivated;
        return null;
      case NotificationTypeV2.EXPIRED:
        return SubscriptionEventKind.expired;
      case NotificationTypeV2.REFUND:
        return SubscriptionEventKind.refunded;
      default:
        return null;
    }
  }

  private resolveStatus(
    notificationType?: string,
    subtype?: string,
    periodEnd?: Date | null,
    now?: Date,
  ): SubscriptionStatus {
    switch (notificationType) {
      case NotificationTypeV2.DID_RENEW:
        return 'active';
      case NotificationTypeV2.EXPIRED:
        return 'expired';
      case NotificationTypeV2.REFUND:
        return 'canceled';
      case NotificationTypeV2.DID_FAIL_TO_RENEW:
        return 'past_due';
      case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
        if (subtype === Subtype.AUTO_RENEW_DISABLED) return 'canceled';
        if (subtype === Subtype.AUTO_RENEW_ENABLED) return 'active';
        return periodEnd && now && periodEnd > now ? 'active' : 'expired';
      default:
        return periodEnd && now && periodEnd > now ? 'active' : 'expired';
    }
  }
}
