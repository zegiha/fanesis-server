import { Language } from '@/generated/prisma/client';

/**
 * IANA timezone으로부터 사용자의 기본 언어를 도출한다.
 * - 'Asia/Seoul' → Language.ko
 * - 그 외 → Language.en
 *
 * 호출 측은 timezone이 유효한 IANA 식별자임을 보장해야 한다
 * (DTO 단의 @IsTimeZone()으로 입구에서 검증됨).
 */
export function deriveLanguageFromTimezone(timezone: string): Language {
  return timezone === 'Asia/Seoul' ? Language.ko : Language.en;
}
