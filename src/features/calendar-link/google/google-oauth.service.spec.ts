import { JwtService } from '@nestjs/jwt';
import { GoogleOauthService } from './google-oauth.service';
import { CalendarOauthStateInvalidException } from '../calendar-link.exceptions';

const cfg = {
  clientId: 'test-client-id',
  clientSecret: 'test-secret',
  redirectUri: 'https://example.com/cb',
  webhookBaseUrl: '',
  mobileSuccessDeepLink: '',
  mobileFailureDeepLink: '',
};
const jwtCfg = {
  accessSecret: 'a'.repeat(32),
  refreshSecret: 'b'.repeat(32),
  accessExpiresIn: '1h' as const,
  refreshExpiresIn: '30d' as const,
};

function makeService(): GoogleOauthService {
  return new GoogleOauthService(cfg, jwtCfg, new JwtService({}));
}

describe('GoogleOauthService — state + authorize URL (unit)', () => {
  const svc = makeService();

  it('embeds required scopes and access_type=offline in authorize URL', () => {
    const url = svc.buildAuthorizeUrl('user-uuid-1');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('test-client-id');
    const scope = parsed.searchParams.get('scope') ?? '';
    expect(scope).toContain('calendar.events');
    expect(scope).toContain('calendar.readonly');
    expect(scope).toContain('userinfo.email');
    expect(parsed.searchParams.get('state')).toBeTruthy();
  });

  it('round-trips state JWT: verifyState returns the userUuid', () => {
    const url = svc.buildAuthorizeUrl('user-uuid-1');
    const state = new URL(url).searchParams.get('state')!;
    const payload = svc.verifyState(state);
    expect(payload.userUuid).toBe('user-uuid-1');
    expect(payload.nonce).toBeTruthy();
  });

  it('throws CalendarOauthStateInvalidException on garbage state', () => {
    expect(() => svc.verifyState('not-a-jwt')).toThrow(
      CalendarOauthStateInvalidException,
    );
  });
});
