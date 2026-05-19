import { registerAs } from '@nestjs/config';

export const googleVisionConfig = registerAs('googleVision', () => ({
  credentialsJson: process.env.GOOGLE_CLOUD_CREDENTIALS_JSON
    ? Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS_JSON, 'base64').toString(
        'utf-8',
      )
    : '',
}));
