import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwtConfig from '@/core/config/jwt.config';
import { InvalidTokenTypeException } from '../../../common/exceptions/auth.exceptions';

type AccessPayload = { sub: string; type: 'access' };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(jwtConfig.KEY)
    jwtCfg: ConfigType<typeof jwtConfig>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtCfg.accessSecret,
      ignoreExpiration: false,
    });
  }

  validate(payload: AccessPayload) {
    if (payload.type !== 'access') {
      throw new InvalidTokenTypeException();
    }
    return { uuid: payload.sub };
  }
}
