import { ApiProperty } from '@nestjs/swagger';

export class AuthorizeResponseDto {
  @ApiProperty({
    description:
      '클라이언트가 ASWebAuthenticationSession 등으로 열어야 할 Google authorize URL',
    example:
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code&scope=...&state=...',
  })
  authorizeUrl!: string;

  static of(url: string): AuthorizeResponseDto {
    const dto = new AuthorizeResponseDto();
    dto.authorizeUrl = url;
    return dto;
  }
}
