import { registerAs } from '@nestjs/config';

export default registerAs('apns', () => {
  const parsed = parseInt(process.env.REMINDER_LEAD_MINUTES ?? '1', 10);
  const reminderLeadMinutes =
    Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;

  return {
    keyId: process.env.APNS_KEY_ID ?? '',
    teamId: process.env.APNS_TEAM_ID ?? '',
    key: process.env.APNS_PRIVATE_KEY ?? '',
    bundleId: process.env.APNS_BUNDLE_ID ?? '',
    production: process.env.APNS_PRODUCTION === 'true',
    reminderLeadMinutes,
  };
});
