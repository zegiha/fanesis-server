import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Language } from '@/generated/prisma/enums';

export class ListLatestTermsQueryDto {
  @ApiPropertyOptional({
    description:
      '응답 본문 언어. 미지정 시 사용자 언어, 사용자 언어도 없으면 en으로 fallback.',
    enum: Language,
    example: 'ko',
  })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}
