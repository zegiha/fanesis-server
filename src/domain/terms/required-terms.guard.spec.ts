import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TermsKind } from '@/generated/prisma/enums';
import { SKIP_TERMS_CHECK } from './decorators/skip-terms-check.decorator';
import { RequiredTermsGuard } from './guards/required-terms.guard';
import {
  RequiredTermsNotAgreedException,
  TermsNotFoundException,
} from './terms.exceptions';
import { TermsService } from './terms.service';

function buildContext({ userUuid }: { userUuid?: string }): ExecutionContext {
  const handler = () => {};
  const cls = class {};
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({
        user: userUuid ? { uuid: userUuid } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RequiredTermsGuard (unit)', () => {
  let guard: RequiredTermsGuard;
  const getMissingRequiredTerms = jest.fn();
  let reflectorGetAllAndOverride: jest.SpyInstance;

  beforeEach(async () => {
    getMissingRequiredTerms.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequiredTermsGuard,
        {
          provide: TermsService,
          useValue: { getMissingRequiredTerms },
        },
        Reflector,
      ],
    }).compile();

    guard = module.get(RequiredTermsGuard);
    const reflector = module.get(Reflector);
    reflectorGetAllAndOverride = jest.spyOn(reflector, 'getAllAndOverride');
  });

  afterEach(() => {
    reflectorGetAllAndOverride.mockRestore();
  });

  it('returns true and skips TermsService when @SkipTermsCheck() is set on handler', async () => {
    reflectorGetAllAndOverride.mockReturnValue(true);
    const ctx = buildContext({ userUuid: 'user-1' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(getMissingRequiredTerms).not.toHaveBeenCalled();
  });

  it('uses SKIP_TERMS_CHECK metadata key', async () => {
    reflectorGetAllAndOverride.mockReturnValue(true);
    const ctx = buildContext({ userUuid: 'user-1' });

    await guard.canActivate(ctx);

    expect(reflectorGetAllAndOverride).toHaveBeenCalledWith(
      SKIP_TERMS_CHECK,
      expect.any(Array),
    );
  });

  it('returns true without calling TermsService when req.user is absent', async () => {
    reflectorGetAllAndOverride.mockReturnValue(false);
    const ctx = buildContext({ userUuid: undefined });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(getMissingRequiredTerms).not.toHaveBeenCalled();
  });

  it('returns true when getMissingRequiredTerms returns empty array', async () => {
    reflectorGetAllAndOverride.mockReturnValue(false);
    getMissingRequiredTerms.mockResolvedValue([]);
    const ctx = buildContext({ userUuid: 'user-1' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(getMissingRequiredTerms).toHaveBeenCalledWith('user-1');
  });

  it('throws RequiredTermsNotAgreedException when there are missing terms', async () => {
    reflectorGetAllAndOverride.mockReturnValue(false);
    const missingTerms = [
      { uuid: 'terms-uuid-1', kind: TermsKind.service, version: 1 },
    ];
    getMissingRequiredTerms.mockResolvedValue(missingTerms);
    const ctx = buildContext({ userUuid: 'user-1' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      RequiredTermsNotAgreedException,
    );
  });

  it('attaches missingTerms to exception.extras', async () => {
    reflectorGetAllAndOverride.mockReturnValue(false);
    const missingTerms = [
      { uuid: 'terms-uuid-1', kind: TermsKind.service, version: 1 },
      { uuid: 'terms-uuid-2', kind: TermsKind.privacy, version: 2 },
    ];
    getMissingRequiredTerms.mockResolvedValue(missingTerms);
    const ctx = buildContext({ userUuid: 'user-1' });

    try {
      await guard.canActivate(ctx);
      fail('expected exception to be thrown');
    } catch (e) {
      const exc = e as RequiredTermsNotAgreedException;
      expect(exc).toBeInstanceOf(RequiredTermsNotAgreedException);
      expect(exc.extras).toBeDefined();
      expect((exc.extras as { missingTerms: unknown }).missingTerms).toEqual(
        missingTerms,
      );
    }
  });

  it('does not throw RequiredTermsNotAgreedException (unrelated), but TermsNotFoundException propagates', async () => {
    // Guard itself doesn't catch TermsService errors — they bubble up
    reflectorGetAllAndOverride.mockReturnValue(false);
    getMissingRequiredTerms.mockRejectedValue(new TermsNotFoundException());
    const ctx = buildContext({ userUuid: 'user-1' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      TermsNotFoundException,
    );
  });
});
