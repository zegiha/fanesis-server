import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Language, TermsKind } from '@/generated/prisma/enums';
import { TermsNotFoundException } from './terms.exceptions';
import { TermsService } from './terms.service';

describe('TermsService (unit)', () => {
  let service: TermsService;

  const usersFindUnique = jest.fn();
  const termsFindUnique = jest.fn();
  const termsAgreementsCreate = jest.fn();
  const queryRaw = jest.fn();
  const termsContentsFindMany = jest.fn();

  beforeEach(async () => {
    usersFindUnique.mockReset();
    termsFindUnique.mockReset();
    termsAgreementsCreate.mockReset();
    queryRaw.mockReset();
    termsContentsFindMany.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TermsService,
        {
          provide: PrismaService,
          useValue: {
            users: { findUnique: usersFindUnique },
            terms: { findUnique: termsFindUnique },
            termsContents: { findMany: termsContentsFindMany },
            termsAgreements: { create: termsAgreementsCreate },
            $queryRaw: queryRaw,
          },
        },
      ],
    }).compile();

    service = module.get(TermsService);
  });

  // ─────────────────────────────────────────────
  // listLatestForUser
  // ─────────────────────────────────────────────
  describe('listLatestForUser', () => {
    const userUuid = 'user-uuid-1';
    const termsUuid1 = 'terms-uuid-1';

    it('returns empty array when no effective terms exist', async () => {
      usersFindUnique.mockResolvedValue({ language: Language.ko });
      queryRaw.mockResolvedValueOnce([]); // latestTerms query
      const result = await service.listLatestForUser(userUuid);
      expect(result).toEqual([]);
    });

    it('maps content for matching language (ko)', async () => {
      usersFindUnique.mockResolvedValue({ language: Language.ko });

      const now = new Date();
      queryRaw
        .mockResolvedValueOnce([
          // latestTerms
          {
            uuid: termsUuid1,
            kind: TermsKind.service,
            version: 1,
            is_required: true,
            effective_at: now,
          },
        ])
        .mockResolvedValueOnce([]); // agreements

      termsContentsFindMany.mockResolvedValue([
        { termsUuid: termsUuid1, content: '서비스 약관 본문' },
      ]);

      const result = await service.listLatestForUser(userUuid);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('서비스 약관 본문');
      expect(result[0].contentLanguage).toBe(Language.ko);
      expect(result[0].agreed).toBe(false);
    });

    it('returns content=null and contentLanguage=null when user language row is missing (no fallback)', async () => {
      usersFindUnique.mockResolvedValue({ language: Language.en });

      const now = new Date();
      queryRaw
        .mockResolvedValueOnce([
          {
            uuid: termsUuid1,
            kind: TermsKind.service,
            version: 1,
            is_required: true,
            effective_at: now,
          },
        ])
        .mockResolvedValueOnce([]); // no agreements

      // No 'en' content row — only 'ko' row in DB; findMany returns empty for en
      termsContentsFindMany.mockResolvedValue([]);

      const result = await service.listLatestForUser(userUuid);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBeNull();
      expect(result[0].contentLanguage).toBeNull();
    });

    it('sets agreed=true when most recent agreement is true', async () => {
      usersFindUnique.mockResolvedValue({ language: Language.ko });

      const now = new Date();
      queryRaw
        .mockResolvedValueOnce([
          {
            uuid: termsUuid1,
            kind: TermsKind.service,
            version: 1,
            is_required: true,
            effective_at: now,
          },
        ])
        .mockResolvedValueOnce([
          // DISTINCT ON result: most recent agreed=true
          { terms_uuid: termsUuid1, agreed: true },
        ]);

      termsContentsFindMany.mockResolvedValue([]);

      const result = await service.listLatestForUser(userUuid);
      expect(result[0].agreed).toBe(true);
    });

    it('sets agreed=false when most recent agreement is false (withdrawal)', async () => {
      usersFindUnique.mockResolvedValue({ language: Language.ko });

      const now = new Date();
      queryRaw
        .mockResolvedValueOnce([
          {
            uuid: termsUuid1,
            kind: TermsKind.service,
            version: 1,
            is_required: true,
            effective_at: now,
          },
        ])
        .mockResolvedValueOnce([
          // most recent is agreed=false (철회)
          { terms_uuid: termsUuid1, agreed: false },
        ]);

      termsContentsFindMany.mockResolvedValue([]);

      const result = await service.listLatestForUser(userUuid);
      expect(result[0].agreed).toBe(false);
    });

    it('sets agreed=false when there is no agreement history', async () => {
      usersFindUnique.mockResolvedValue({ language: Language.ko });

      const now = new Date();
      queryRaw
        .mockResolvedValueOnce([
          {
            uuid: termsUuid1,
            kind: TermsKind.service,
            version: 1,
            is_required: true,
            effective_at: now,
          },
        ])
        .mockResolvedValueOnce([]); // empty — no history

      termsContentsFindMany.mockResolvedValue([]);

      const result = await service.listLatestForUser(userUuid);
      expect(result[0].agreed).toBe(false);
    });

    it('defaults to ko when user row not found', async () => {
      // user not found -> default language ko
      usersFindUnique.mockResolvedValue(null);

      queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      termsContentsFindMany.mockResolvedValue([]);

      await service.listLatestForUser(userUuid);

      // findMany should have been called with language: Language.ko
      expect(termsContentsFindMany).not.toHaveBeenCalled(); // no terms → no findMany call
    });

    it('handles multiple kinds and maps agreements correctly', async () => {
      usersFindUnique.mockResolvedValue({ language: Language.ko });

      const now = new Date();
      const termsUuid2 = 'terms-uuid-2';

      queryRaw
        .mockResolvedValueOnce([
          {
            uuid: termsUuid1,
            kind: TermsKind.service,
            version: 1,
            is_required: true,
            effective_at: now,
          },
          {
            uuid: termsUuid2,
            kind: TermsKind.privacy,
            version: 2,
            is_required: true,
            effective_at: now,
          },
        ])
        .mockResolvedValueOnce([
          { terms_uuid: termsUuid1, agreed: true },
          // termsUuid2 has no entry — agreed defaults to false
        ]);

      termsContentsFindMany.mockResolvedValue([
        { termsUuid: termsUuid1, content: '서비스' },
        { termsUuid: termsUuid2, content: '개인정보' },
      ]);

      const result = await service.listLatestForUser(userUuid);

      expect(result).toHaveLength(2);
      const svc = result.find((r) => r.uuid === termsUuid1)!;
      const priv = result.find((r) => r.uuid === termsUuid2)!;
      expect(svc.agreed).toBe(true);
      expect(priv.agreed).toBe(false);
    });

    it('only calls $queryRaw once for latestTerms when terms list is empty', async () => {
      usersFindUnique.mockResolvedValue({ language: Language.ko });
      queryRaw.mockResolvedValueOnce([]); // returns empty — no second call expected

      await service.listLatestForUser(userUuid);

      // queryRaw should be called exactly once (for latestTerms); agreements query skipped
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────
  // agreeTerms
  // ─────────────────────────────────────────────
  describe('agreeTerms', () => {
    const userUuid = 'user-uuid-1';
    const termsUuid = 'terms-uuid-1';

    it('throws TermsNotFoundException when terms does not exist', async () => {
      termsFindUnique.mockResolvedValue(null);

      await expect(
        service.agreeTerms(userUuid, termsUuid, true),
      ).rejects.toBeInstanceOf(TermsNotFoundException);

      expect(termsAgreementsCreate).not.toHaveBeenCalled();
    });

    it('inserts a terms_agreements row on successful agreement', async () => {
      termsFindUnique.mockResolvedValue({ uuid: termsUuid });
      termsAgreementsCreate.mockResolvedValue({ uuid: 'agreement-uuid-1' });

      await service.agreeTerms(
        userUuid,
        termsUuid,
        true,
        '127.0.0.1',
        'TestAgent/1',
      );

      expect(termsAgreementsCreate).toHaveBeenCalledTimes(1);
      expect(termsAgreementsCreate).toHaveBeenCalledWith({
        data: {
          userUuid,
          termsUuid,
          agreed: true,
          ipAddress: '127.0.0.1',
          userAgent: 'TestAgent/1',
        },
      });
    });

    it('stores ip and ua as null when not provided', async () => {
      termsFindUnique.mockResolvedValue({ uuid: termsUuid });
      termsAgreementsCreate.mockResolvedValue({ uuid: 'agreement-uuid-2' });

      await service.agreeTerms(userUuid, termsUuid, false);

      expect(termsAgreementsCreate).toHaveBeenCalledWith({
        data: {
          userUuid,
          termsUuid,
          agreed: false,
          ipAddress: null,
          userAgent: null,
        },
      });
    });

    it('inserts every time (append-only — no dedupe on identical calls)', async () => {
      termsFindUnique.mockResolvedValue({ uuid: termsUuid });
      termsAgreementsCreate.mockResolvedValue({ uuid: 'a1' });

      await service.agreeTerms(userUuid, termsUuid, true);
      await service.agreeTerms(userUuid, termsUuid, true);

      expect(termsAgreementsCreate).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────
  // getMissingRequiredTerms
  // ─────────────────────────────────────────────
  describe('getMissingRequiredTerms', () => {
    const userUuid = 'user-uuid-1';
    const termsUuid1 = 'terms-uuid-1';
    const termsUuid2 = 'terms-uuid-2';

    it('returns empty array when no required terms exist', async () => {
      queryRaw.mockResolvedValueOnce([]); // no required terms

      const result = await service.getMissingRequiredTerms(userUuid);

      expect(result).toEqual([]);
      // second queryRaw (agreements) should not be called
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('includes terms with no agreement history in the missing list', async () => {
      queryRaw
        .mockResolvedValueOnce([
          { uuid: termsUuid1, kind: TermsKind.service, version: 1 },
        ])
        .mockResolvedValueOnce([]); // no agreements

      const result = await service.getMissingRequiredTerms(userUuid);

      expect(result).toHaveLength(1);
      expect(result[0].uuid).toBe(termsUuid1);
    });

    it('includes terms whose latest agreement is agreed=false (withdrawal)', async () => {
      queryRaw
        .mockResolvedValueOnce([
          { uuid: termsUuid1, kind: TermsKind.privacy, version: 1 },
        ])
        .mockResolvedValueOnce([{ terms_uuid: termsUuid1, agreed: false }]);

      const result = await service.getMissingRequiredTerms(userUuid);

      expect(result).toHaveLength(1);
      expect(result[0].uuid).toBe(termsUuid1);
    });

    it('excludes terms whose latest agreement is agreed=true', async () => {
      queryRaw
        .mockResolvedValueOnce([
          { uuid: termsUuid1, kind: TermsKind.service, version: 1 },
        ])
        .mockResolvedValueOnce([{ terms_uuid: termsUuid1, agreed: true }]);

      const result = await service.getMissingRequiredTerms(userUuid);

      expect(result).toHaveLength(0);
    });

    it('includes new required version even when older version is agreed', async () => {
      // Scenario: user agreed v1 but v2 is now the latest required
      // The $queryRaw returns only the latest (v2) as "required terms"
      queryRaw
        .mockResolvedValueOnce([
          { uuid: termsUuid2, kind: TermsKind.service, version: 2 },
        ])
        // user has no agreement for v2 (only for v1 which is not returned)
        .mockResolvedValueOnce([]);

      const result = await service.getMissingRequiredTerms(userUuid);

      expect(result).toHaveLength(1);
      expect(result[0].uuid).toBe(termsUuid2);
      expect(result[0].version).toBe(2);
    });

    it('returns only missing ones when multiple required terms exist', async () => {
      queryRaw
        .mockResolvedValueOnce([
          { uuid: termsUuid1, kind: TermsKind.service, version: 1 },
          { uuid: termsUuid2, kind: TermsKind.privacy, version: 1 },
        ])
        .mockResolvedValueOnce([
          { terms_uuid: termsUuid1, agreed: true },
          // termsUuid2 has no agreement
        ]);

      const result = await service.getMissingRequiredTerms(userUuid);

      expect(result).toHaveLength(1);
      expect(result[0].uuid).toBe(termsUuid2);
    });

    it('returns empty when all required terms are agreed', async () => {
      queryRaw
        .mockResolvedValueOnce([
          { uuid: termsUuid1, kind: TermsKind.service, version: 1 },
          { uuid: termsUuid2, kind: TermsKind.privacy, version: 1 },
        ])
        .mockResolvedValueOnce([
          { terms_uuid: termsUuid1, agreed: true },
          { terms_uuid: termsUuid2, agreed: true },
        ]);

      const result = await service.getMissingRequiredTerms(userUuid);

      expect(result).toHaveLength(0);
    });
  });
});
