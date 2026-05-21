import { registerAs } from '@nestjs/config';

export default registerAs('apple', () => ({
  bundleId: process.env.APPLE_BUNDLE_ID!,
  teamId: process.env.APPLE_TEAM_ID ?? '',
  environment: process.env.APPLE_ENVIRONMENT ?? 'Sandbox',
  // Apple Root CA - G3 (base64 DER). Apple PKI(https://www.apple.com/certificateauthority/) 에서 다운로드.
  rootCaG3: process.env.APPLE_ROOT_CA_G3 ?? '',
}));
