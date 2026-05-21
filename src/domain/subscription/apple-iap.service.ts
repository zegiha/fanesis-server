import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  Environment,
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
  SignedDataVerifier,
  Type,
} from '@apple/app-store-server-library';
import appleConfig from '@/core/config/apple.config';
import {
  SubscriptionInvalidProductTypeException,
  SubscriptionJwsVerificationFailedException,
} from './exceptions/subscription.exceptions';

@Injectable()
export class AppleIapService {
  private readonly logger = new Logger(AppleIapService.name);
  private readonly verifier: SignedDataVerifier;

  constructor(
    @Inject(appleConfig.KEY)
    private readonly appleCfg: ConfigType<typeof appleConfig>,
  ) {
    const rootCAs: Buffer[] = appleCfg.rootCaG3
      ? [Buffer.from(appleCfg.rootCaG3, 'base64')]
      : [];

    const environment =
      appleCfg.environment === 'Production'
        ? Environment.PRODUCTION
        : Environment.SANDBOX;

    this.verifier = new SignedDataVerifier(
      rootCAs,
      true,
      environment,
      appleCfg.bundleId,
    );
  }

  async verifyTransaction(
    jwsTransaction: string,
  ): Promise<JWSTransactionDecodedPayload> {
    let decoded: JWSTransactionDecodedPayload;
    try {
      decoded = await this.verifier.verifyAndDecodeTransaction(jwsTransaction);
    } catch (err) {
      this.logger.warn(
        `JWS transaction verification failed: ${(err as Error).message}`,
      );
      throw new SubscriptionJwsVerificationFailedException();
    }

    if (decoded.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION) {
      throw new SubscriptionInvalidProductTypeException();
    }

    return decoded;
  }

  async verifyNotification(
    signedPayload: string,
  ): Promise<ResponseBodyV2DecodedPayload> {
    return this.verifier.verifyAndDecodeNotification(signedPayload);
  }
}
