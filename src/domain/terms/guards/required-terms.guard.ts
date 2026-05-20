import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_TERMS_CHECK } from '../decorators/skip-terms-check.decorator';
import { RequiredTermsNotAgreedException } from '../terms.exceptions';
import { TermsService } from '../terms.service';

@Injectable()
export class RequiredTermsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly termsService: TermsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check SKIP_TERMS_CHECK on handler and class
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TERMS_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { uuid: string };
    }>();

    // If no authenticated user, pass through (JwtAuthGuard is responsible)
    const userUuid = request.user?.uuid;
    if (!userUuid) {
      return true;
    }

    const missing = await this.termsService.getMissingRequiredTerms(userUuid);
    if (missing.length > 0) {
      throw new RequiredTermsNotAgreedException(missing);
    }

    return true;
  }
}
