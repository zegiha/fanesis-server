import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import appleConfig from '@/core/config/apple.config';
import { AppleAuthService } from './apple-auth.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { JwtTokenService } from './jwt-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    ConfigModule.forFeature(appleConfig),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleAuthService,
    AppleAuthService,
    JwtTokenService,
    JwtStrategy,
  ],
  exports: [JwtTokenService],
})
export class AuthModule {}
