import { registerAs } from '@nestjs/config';

export default registerAs('apns', () => {
  const parsed = parseInt(process.env.REMINDER_LEAD_MINUTES ?? '1', 10);
  const reminderLeadMinutes =
    Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;

  return {
    keyId: process.env.APPLE_KEY_ID ?? '',
    teamId: process.env.APPLE_TEAM_ID ?? '',
    key: process.env.APPLE_PRIVATE_KEY ?? '',
    bundleId: process.env.APPLE_BUNDLE_ID ?? '',
    production: process.env.APPLE_ENVIRONMENT === 'Production',
    reminderLeadMinutes,
  };
});
