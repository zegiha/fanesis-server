import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ConfirmOcrDto {
  @ApiProperty({
    description: 'OCR 업로드 URL 발급 시 받은 OCR 토큰 (JWT)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @MinLength(1)
  ocrToken!: string;
}
