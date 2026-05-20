import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthResponseDto } from './dto/response/auth-response.dto';
import { RefreshResponseDto } from './dto/response/refresh-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('google/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Google 로그인',
    description:
      'Swift 클라이언트에서 Google Sign-In으로 받은 idToken을 검증하고, ' +
      '신규 유저면 가입 처리 후 자체 JWT 토큰을 발급한다.',
  })
  @ApiOkResponse({
    description: '로그인/가입 성공. 유저 정보와 토큰을 반환',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({ description: '유효하지 않은 Google ID 토큰' })
  googleLogin(@Body() dto: GoogleLoginDto): Promise<AuthResponseDto> {
    return this.auth.loginWithGoogle(dto.idToken, dto.timezone);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Access Token 재발급',
    description: 'Refresh Token을 사용해 새로운 Access Token을 발급한다.',
  })
  @ApiOkResponse({
    description: '재발급 성공',
    type: RefreshResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: '만료되었거나 유효하지 않은 Refresh Token',
  })
  refresh(@Body() dto: RefreshDto): Promise<RefreshResponseDto> {
    return this.auth.refreshTokens(dto.refreshToken);
  }
}
