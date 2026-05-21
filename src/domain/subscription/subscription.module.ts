import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appleConfig from '@/core/config/apple.config';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { AppleIapService } from './apple-iap.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { AppleWebhookController } from './webhook/apple-webhook.controller';

@Module({
  imports: [ConfigModule.forFeature(appleConfig), PrismaModule],
  controllers: [SubscriptionController, AppleWebhookController],
  providers: [SubscriptionService, AppleIapService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
