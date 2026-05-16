import { registerAs } from '@nestjs/config';

export default registerAs('google', () => ({
  iosClientId: process.env.GOOGLE_IOS_CLIENT_ID!,
}));
