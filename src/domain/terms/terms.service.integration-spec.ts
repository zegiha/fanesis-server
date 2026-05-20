import { Test } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import type { PrismaClient } from '@/generated/prisma/client';
import { Language, TermsKind } from '@/generated/prisma/client';
import { createTestPrisma, truncateAll } from '../../../test/setup/prisma-test';
import { TermsService } from './terms.service';

describe('terms (integration)', () => {
  let prisma: PrismaClient;
  let service: TermsService;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const module = await Test.createTestingModule({
      providers: [TermsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TermsService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─────────────────────────────────────────────
  // Helper factories
  // ─────────────────────────────────────────────
  async function createUser(language: Language = Language.ko) {
    return prisma.users.create({
      data: { language, timezone: 'Asia/Seoul' },
    });
  }

  async function createTerms(
    opts: {
      kind?: TermsKind;
      version?: number;
      isRequired?: boolean;
      effectiveAt?: Date;
    } = {},
  ) {
    const {
      kind = TermsKind.service,
      version = 1,
      isRequired = true,
      effectiveAt = new Date(),
    } = opts;
    return prisma.terms.create({
      data: { kind, version, isRequired, effectiveAt },
    });
  }

  async function createTermsContent(
    termsUuid: string,
    language: Language,
    content: string,
  ) {
    return prisma.termsContents.create({
      data: { termsUuid, language, content },
    });
  }

  async function agreeToTerms(
    userUuid: string,
    termsUuid: string,
    agreed: boolean,
    agreedAt?: Date,
  ) {
    return prisma.termsAgreements.create({
      data: {
        userUuid,
        termsUuid,
        agreed,
        agreedAt: agreedAt ?? new Date(),
      },
    });
  }

  // ─────────────────────────────────────────────
  // CHECK constraint: version > 0
  // ─────────────────────────────────────────────
  describe('CHECK constraint: version > 0', () => {
    it('rejects version=0 on terms INSERT', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO terms (kind, version, is_required, effective_at)
           VALUES ('service', 0, true, NOW())`,
        ),
      ).rejects.toThrow();
    });

    it('rejects version=-1 on terms INSERT', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO terms (kind, version, is_required, effective_at)
           VALUES ('service', -1, true, NOW())`,
        ),
      ).rejects.toThrow();
    });

    it('accepts version=1 on terms INSERT', async () => {
      const t = await createTerms({ version: 1 });
      expect(t.version).toBe(1);
    });
  });

  // ─────────────────────────────────────────────
  // CHECK constraint: length(content) > 0
  // ─────────────────────────────────────────────
  describe('CHECK constraint: length(content) > 0', () => {
    it('rejects empty string content in terms_contents', async () => {
      const t = await createTerms();
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO terms_contents (terms_uuid, language, content)
           VALUES ($1::uuid, 'ko', '')`,
          t.uuid,
        ),
      ).rejects.toThrow();
    });

    it('accepts non-empty content', async () => {
      const t = await createTerms();
      const c = await createTermsContent(t.uuid, Language.ko, '약관 본문');
      expect(c.content).toBe('약관 본문');
    });
  });

  // ─────────────────────────────────────────────
  // UNIQUE constraint: (kind, version)
  // ─────────────────────────────────────────────
  describe('UNIQUE (kind, version)', () => {
    it('rejects duplicate (kind, version) INSERT', async () => {
      await createTerms({ kind: TermsKind.service, version: 1 });
      await expect(
        createTerms({ kind: TermsKind.service, version: 1 }),
      ).rejects.toThrow();
    });

    it('allows same version for different kinds', async () => {
      await createTerms({ kind: TermsKind.service, version: 1 });
      const t2 = await createTerms({ kind: TermsKind.privacy, version: 1 });
      expect(t2.uuid).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────
  // PK constraint: terms_contents (terms_uuid, language)
  // ─────────────────────────────────────────────
  describe('PK (terms_uuid, language) in terms_contents', () => {
    it('rejects duplicate (terms_uuid, language) INSERT', async () => {
      const t = await createTerms();
      await createTermsContent(t.uuid, Language.ko, '원본 본문');
      await expect(
        createTermsContent(t.uuid, Language.ko, '중복 본문'),
      ).rejects.toThrow();
    });

    it('allows different language for the same terms', async () => {
      const t = await createTerms();
      await createTermsContent(t.uuid, Language.ko, '한국어 본문');
      const en = await createTermsContent(
        t.uuid,
        Language.en,
        'English content',
      );
      expect(en.language).toBe(Language.en);
    });
  });

  // ─────────────────────────────────────────────
  // CASCADE: terms DELETE → contents + agreements
  // ─────────────────────────────────────────────
  describe('CASCADE on terms DELETE', () => {
    it('deletes terms_contents and terms_agreements when terms is deleted', async () => {
      const user = await createUser();
      const t = await createTerms();
      await createTermsContent(t.uuid, Language.ko, '본문');
      await agreeToTerms(user.uuid, t.uuid, true);

      await prisma.terms.delete({ where: { uuid: t.uuid } });

      const contentsCount = await prisma.termsContents.count({
        where: { termsUuid: t.uuid },
      });
      const agreementsCount = await prisma.termsAgreements.count({
        where: { termsUuid: t.uuid },
      });
      expect(contentsCount).toBe(0);
      expect(agreementsCount).toBe(0);
    });

    it('preserves other terms rows when one is deleted', async () => {
      const t1 = await createTerms({ kind: TermsKind.service, version: 1 });
      const t2 = await createTerms({ kind: TermsKind.privacy, version: 1 });
      await createTermsContent(t1.uuid, Language.ko, '서비스');
      await createTermsContent(t2.uuid, Language.ko, '개인정보');

      await prisma.terms.delete({ where: { uuid: t1.uuid } });

      const remaining = await prisma.termsContents.count({
        where: { termsUuid: t2.uuid },
      });
      expect(remaining).toBe(1);
    });
  });

  // ─────────────────────────────────────────────
  // CASCADE: users DELETE → terms_agreements
  // ─────────────────────────────────────────────
  describe('CASCADE on users DELETE', () => {
    it('deletes terms_agreements when user is deleted, preserves terms itself', async () => {
      const user = await createUser();
      const t = await createTerms();
      await agreeToTerms(user.uuid, t.uuid, true);

      await prisma.users.delete({ where: { uuid: user.uuid } });

      const agreementsCount = await prisma.termsAgreements.count({
        where: { userUuid: user.uuid },
      });
      const termStillExists = await prisma.terms.findUnique({
        where: { uuid: t.uuid },
      });
      expect(agreementsCount).toBe(0);
      expect(termStillExists).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // Service: listLatestForUser — real DB
  // ─────────────────────────────────────────────
  describe('TermsService.listLatestForUser (real DB)', () => {
    it('returns only the latest version per kind (v3 when v1,v2,v3 exist)', async () => {
      const user = await createUser(Language.ko);
      await createTerms({ kind: TermsKind.service, version: 1 });
      await createTerms({ kind: TermsKind.service, version: 2 });
      const v3 = await createTerms({ kind: TermsKind.service, version: 3 });
      await createTermsContent(v3.uuid, Language.ko, 'v3 본문');

      const result = await service.listLatestForUser(user.uuid);

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe(3);
      expect(result[0].content).toBe('v3 본문');
    });

    it('excludes future effective_at terms from the list', async () => {
      const user = await createUser();
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24); // +1 day
      await createTerms({ effectiveAt: futureDate });

      const result = await service.listLatestForUser(user.uuid);

      expect(result).toHaveLength(0);
    });

    it('includes current terms but excludes future terms when both exist', async () => {
      const user = await createUser();
      const now = new Date();
      const future = new Date(Date.now() + 1000 * 60 * 60 * 24);
      await createTerms({
        kind: TermsKind.service,
        version: 1,
        effectiveAt: now,
      });
      await createTerms({
        kind: TermsKind.service,
        version: 2,
        effectiveAt: future,
      });

      const result = await service.listLatestForUser(user.uuid);

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe(1);
    });

    it('reflects agreed=true after user agrees', async () => {
      const user = await createUser();
      const t = await createTerms();
      await agreeToTerms(user.uuid, t.uuid, true);

      const result = await service.listLatestForUser(user.uuid);

      expect(result[0].agreed).toBe(true);
    });

    it('reflects agreed=false when latest record is a withdrawal', async () => {
      const user = await createUser();
      const t = await createTerms();
      const t1 = new Date(Date.now() - 2000);
      const t2 = new Date(Date.now() - 1000);
      await agreeToTerms(user.uuid, t.uuid, true, t1);
      await agreeToTerms(user.uuid, t.uuid, false, t2); // latest = false

      const result = await service.listLatestForUser(user.uuid);

      expect(result[0].agreed).toBe(false);
    });

    it('falls back to en when user language (ko) row is missing', async () => {
      const user = await createUser(Language.ko);
      const t = await createTerms();
      await createTermsContent(t.uuid, Language.en, 'English fallback');

      const result = await service.listLatestForUser(user.uuid);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('English fallback');
      expect(result[0].contentLanguage).toBe(Language.en);
    });

    it('returns content=null when both primary (ko) and en rows are missing', async () => {
      const user = await createUser(Language.ko);
      await createTerms();

      const result = await service.listLatestForUser(user.uuid);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBeNull();
      expect(result[0].contentLanguage).toBeNull();
    });

    it('uses languageOverride (query string) to select content language', async () => {
      const user = await createUser(Language.ko);
      const t = await createTerms();
      await createTermsContent(t.uuid, Language.ko, '한국어 본문');
      await createTermsContent(t.uuid, Language.en, 'English body');

      const result = await service.listLatestForUser(user.uuid, Language.en);

      expect(result[0].content).toBe('English body');
      expect(result[0].contentLanguage).toBe(Language.en);
    });

    it('languageOverride still falls back to en when override row is missing', async () => {
      const user = await createUser(Language.en);
      const t = await createTerms();
      await createTermsContent(t.uuid, Language.en, 'EN only');

      // request ko via override, but only en exists → en fallback wins
      const result = await service.listLatestForUser(user.uuid, Language.ko);

      expect(result[0].content).toBe('EN only');
      expect(result[0].contentLanguage).toBe(Language.en);
    });

    it('tie-break: when agreed_at is identical, uuid DESC determines winner', async () => {
      const user = await createUser();
      const t = await createTerms();
      const sameTime = new Date();

      // Insert two rows with the same agreed_at — UUIDs are random so we
      // determine the expected winner after insertion by sorting uuid DESC
      const row1 = await agreeToTerms(user.uuid, t.uuid, false, sameTime);
      const row2 = await agreeToTerms(user.uuid, t.uuid, true, sameTime);

      // Find which row has the lexicographically larger uuid (that is the tie-break winner)
      const expectedWinner = [row1, row2].sort((a, b) =>
        b.uuid.localeCompare(a.uuid),
      )[0];

      // Run the same DISTINCT ON query the service uses
      const agreements = await prisma.$queryRaw<
        Array<{ terms_uuid: string; agreed: boolean }>
      >`
        SELECT DISTINCT ON (terms_uuid) terms_uuid, agreed
          FROM terms_agreements
         WHERE user_uuid = ${user.uuid}::uuid
           AND terms_uuid = ANY(ARRAY[${t.uuid}]::uuid[])
         ORDER BY terms_uuid, agreed_at DESC, uuid DESC
      `;

      expect(agreements).toHaveLength(1);
      // DB DISTINCT ON result must agree with the row that has the larger uuid
      expect(agreements[0].agreed).toBe(expectedWinner.agreed);
    });
  });

  // ─────────────────────────────────────────────
  // Service: getMissingRequiredTerms — real DB
  // ─────────────────────────────────────────────
  describe('TermsService.getMissingRequiredTerms (real DB)', () => {
    it('returns empty array when no required terms exist', async () => {
      const user = await createUser();
      const result = await service.getMissingRequiredTerms(user.uuid);
      expect(result).toEqual([]);
    });

    it('returns missing required term when user has not agreed', async () => {
      const user = await createUser();
      const t = await createTerms({ isRequired: true, version: 1 });

      const result = await service.getMissingRequiredTerms(user.uuid);

      expect(result).toHaveLength(1);
      expect(result[0].uuid).toBe(t.uuid);
      expect(result[0].kind).toBe(TermsKind.service);
      expect(result[0].version).toBe(1);
    });

    it('returns empty array after user agrees to required term', async () => {
      const user = await createUser();
      const t = await createTerms({ isRequired: true });
      await agreeToTerms(user.uuid, t.uuid, true);

      const result = await service.getMissingRequiredTerms(user.uuid);

      expect(result).toHaveLength(0);
    });

    it('includes required v2 as missing when user only agreed to v1', async () => {
      const user = await createUser();
      const v1 = await createTerms({ version: 1, isRequired: true });
      await agreeToTerms(user.uuid, v1.uuid, true);

      // Now v2 is the latest required (v1 is superseded)
      const v2 = await createTerms({ version: 2, isRequired: true });

      const result = await service.getMissingRequiredTerms(user.uuid);

      // DISTINCT ON (kind) ORDER BY version DESC returns v2 as the latest
      expect(result).toHaveLength(1);
      expect(result[0].uuid).toBe(v2.uuid);
      expect(result[0].version).toBe(2);
    });

    it('includes term again after withdrawal (agreed=false)', async () => {
      const user = await createUser();
      const t = await createTerms({ isRequired: true });
      const t1 = new Date(Date.now() - 2000);
      const t2 = new Date(Date.now() - 1000);
      await agreeToTerms(user.uuid, t.uuid, true, t1);
      await agreeToTerms(user.uuid, t.uuid, false, t2); // withdrawal

      const result = await service.getMissingRequiredTerms(user.uuid);

      expect(result).toHaveLength(1);
      expect(result[0].uuid).toBe(t.uuid);
    });

    it('excludes future effective_at required terms from missing check', async () => {
      const user = await createUser();
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
      await createTerms({ isRequired: true, effectiveAt: futureDate });

      const result = await service.getMissingRequiredTerms(user.uuid);

      // Future terms are not yet effective — should not be in missing list
      expect(result).toHaveLength(0);
    });

    it('does not include optional (isRequired=false) terms in missing list', async () => {
      const user = await createUser();
      await createTerms({ isRequired: false, kind: TermsKind.marketing });

      const result = await service.getMissingRequiredTerms(user.uuid);

      expect(result).toHaveLength(0);
    });
  });
});
