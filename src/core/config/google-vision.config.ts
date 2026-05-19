import { registerAs } from '@nestjs/config';

export const googleVisionConfig = registerAs('googleVision', () => ({
  apiKey: process.env.GOOGLE_VISION_API_KEY ?? '',
}));
