import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

export class AuthResponseDto {
  @ApiProperty({
    description: '로그인된 유저 정보',
    type: () => UserResponseDto,
  })
  user!: UserResponseDto;

  @ApiProperty({
    description:
      'API 호출에 사용할 Access Token (JWT, 만료 1시간). Authorization 헤더에 `Bearer <token>` 형식으로 첨부',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
  })
  accessToken!: string;

  @ApiProperty({
    description:
      'Access Token 갱신에 사용할 Refresh Token (JWT, 만료 30일). 안전한 저장소에 보관',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
  })
  refreshToken!: string;
}
