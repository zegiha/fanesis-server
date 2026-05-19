import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ConfirmOcrDto {
  @ApiProperty({
    description: 'OCR 업로드 URL 발급 시 받은 OCR 키',
    example: 'aBcDeFgHiJ',
  })
  @IsString()
  @MinLength(1)
  ocrKey!: string;
}
