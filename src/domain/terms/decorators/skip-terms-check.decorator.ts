import { SetMetadata } from '@nestjs/common';

export const SKIP_TERMS_CHECK = 'skipTermsCheck';
export const SkipTermsCheck = () => SetMetadata(SKIP_TERMS_CHECK, true);
