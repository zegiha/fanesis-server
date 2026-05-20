import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Language, TermsKind } from '@/generated/prisma/enums';
import { LatestTermsEntity } from './dto/response/latest-terms-response.dto';
import { TermsNotFoundException } from './terms.exceptions';

@Injectable()
export class TermsService {
  constructor(private readonly prisma: PrismaService) {}

  async listLatestForUser(userUuid: string): Promise<LatestTermsEntity[]> {
    // Resolve user language
    const user = await this.prisma.users.findUnique({
      where: { uuid: userUuid },
      select: { language: true },
    });
    const language: Language = user?.language ?? Language.ko;

    // Get the latest version per kind (effective_at <= NOW())
    const latestTerms = await this.prisma.$queryRaw<
      Array<{
        uuid: string;
        kind: TermsKind;
        version: number;
        is_required: boolean;
        effective_at: Date;
      }>
    >`
      SELECT DISTINCT ON (kind) uuid, kind, version, is_required, effective_at
        FROM terms
       WHERE effective_at <= NOW()
       ORDER BY kind, version DESC
    `;

    if (latestTerms.length === 0) {
      return [];
    }

    const termUuids = latestTerms.map((t) => t.uuid);

    // Get content for user's language
    const contents = await this.prisma.termsContents.findMany({
      where: {
        termsUuid: { in: termUuids },
        language,
      },
    });
    const contentMap = new Map(contents.map((c) => [c.termsUuid, c.content]));

    // Get latest agreement per terms for this user (tie-break: agreed_at DESC, uuid DESC)
    const agreements = await this.prisma.$queryRaw<
      Array<{ terms_uuid: string; agreed: boolean }>
    >`
      SELECT DISTINCT ON (terms_uuid) terms_uuid, agreed
        FROM terms_agreements
       WHERE user_uuid = ${userUuid}::uuid
         AND terms_uuid = ANY(${termUuids}::uuid[])
       ORDER BY terms_uuid, agreed_at DESC, uuid DESC
    `;
    const agreementMap = new Map(
      agreements.map((a) => [a.terms_uuid, a.agreed]),
    );

    return latestTerms.map((t) => ({
      uuid: t.uuid,
      kind: t.kind,
      version: t.version,
      isRequired: t.is_required,
      effectiveAt: t.effective_at,
      content: contentMap.get(t.uuid) ?? null,
      contentLanguage: contentMap.has(t.uuid) ? language : null,
      agreed: agreementMap.get(t.uuid) ?? false,
    }));
  }

  async agreeTerms(
    userUuid: string,
    termsUuid: string,
    agreed: boolean,
    ip?: string,
    ua?: string,
  ): Promise<void> {
    const terms = await this.prisma.terms.findUnique({
      where: { uuid: termsUuid },
    });
    if (!terms) {
      throw new TermsNotFoundException();
    }

    await this.prisma.termsAgreements.create({
      data: {
        userUuid,
        termsUuid,
        agreed,
        ipAddress: ip ?? null,
        userAgent: ua ?? null,
      },
    });
  }

  async getMissingRequiredTerms(
    userUuid: string,
  ): Promise<Array<{ uuid: string; kind: TermsKind; version: number }>> {
    // Step 1: latest required terms per kind (effective_at <= NOW())
    const requiredTerms = await this.prisma.$queryRaw<
      Array<{ uuid: string; kind: TermsKind; version: number }>
    >`
      SELECT DISTINCT ON (kind) uuid, kind, version
        FROM terms
       WHERE is_required = true AND effective_at <= NOW()
       ORDER BY kind, version DESC
    `;

    if (requiredTerms.length === 0) {
      return [];
    }

    const termUuids = requiredTerms.map((t) => t.uuid);

    // Step 2: most recent agreement per terms for this user
    const agreements = await this.prisma.$queryRaw<
      Array<{ terms_uuid: string; agreed: boolean }>
    >`
      SELECT DISTINCT ON (terms_uuid) terms_uuid, agreed
        FROM terms_agreements
       WHERE user_uuid = ${userUuid}::uuid
         AND terms_uuid = ANY(${termUuids}::uuid[])
       ORDER BY terms_uuid, agreed_at DESC, uuid DESC
    `;
    const agreementMap = new Map(
      agreements.map((a) => [a.terms_uuid, a.agreed]),
    );

    // Step 3: filter to missing (no agreement or agreed=false)
    return requiredTerms.filter((t) => {
      const agreedValue = agreementMap.get(t.uuid);
      return agreedValue === undefined || agreedValue === false;
    });
  }
}
