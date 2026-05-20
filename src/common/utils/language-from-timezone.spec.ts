import { Language } from '@/generated/prisma/client';
import { deriveLanguageFromTimezone } from './language-from-timezone';

describe('deriveLanguageFromTimezone', () => {
  it('maps Asia/Seoul to ko', () => {
    expect(deriveLanguageFromTimezone('Asia/Seoul')).toBe(Language.ko);
  });

  it.each([
    'America/New_York',
    'Europe/London',
    'Asia/Tokyo',
    'Asia/Pyongyang',
    'UTC',
    'Pacific/Auckland',
  ])('maps %s to en', (tz) => {
    expect(deriveLanguageFromTimezone(tz)).toBe(Language.en);
  });
});
