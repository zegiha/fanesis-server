import { registerAs } from '@nestjs/config';

export const storageConfig = registerAs('storage', () => ({
  bucket: process.env.R2_BUCKET ?? '',
  endpoint: process.env.R2_ENDPOINT ?? '',
  accessKey: process.env.R2_ACCESS_KEY ?? '',
  secretKey: process.env.R2_SECRET_KEY ?? '',
}));
