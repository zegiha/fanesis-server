import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import * as apn from '@parse/node-apn';
import apnsConfig from '@/core/config/apns.config';

@Injectable()
export class ApnsProvider implements OnModuleDestroy {
  private readonly logger = new Logger(ApnsProvider.name);
  readonly client: apn.Provider | null;

  constructor(
    @Inject(apnsConfig.KEY) private readonly cfg: ConfigType<typeof apnsConfig>,
  ) {
    if (!cfg.keyId || !cfg.teamId || !cfg.key || !cfg.bundleId) {
      this.logger.warn('APNs 자격증명 미설정 — push 비활성화');
      this.client = null;
      return;
    }
    this.client = new apn.Provider({
      token: {
        key: cfg.key,
        keyId: cfg.keyId,
        teamId: cfg.teamId,
      },
      production: cfg.production,
    });
  }

  onModuleDestroy(): void {
    void this.client?.shutdown();
  }
}
