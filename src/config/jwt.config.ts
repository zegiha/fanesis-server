import { registerAs } from '@nestjs/config';

export default registerAs(
  'jwt',
  () =>
    ({
      accessSecret: process.env.JWT_ACCESS_SECRET!,
      refreshSecret: process.env.JWT_REFRESH_SECRET!,
      accessExpiresIn: '1h',
      refreshExpiresIn: '30d',
    }) as const,
);
