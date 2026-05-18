import { registerAs } from '@nestjs/config';

export default registerAs('googleCalendar', () => ({
  clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
  redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
  webhookBaseUrl: process.env.GOOGLE_CALENDAR_WEBHOOK_BASE_URL!,
  mobileSuccessDeepLink: process.env.MOBILE_DEEP_LINK_CALENDAR_SUCCESS!,
  mobileFailureDeepLink: process.env.MOBILE_DEEP_LINK_CALENDAR_FAILURE!,
}));
