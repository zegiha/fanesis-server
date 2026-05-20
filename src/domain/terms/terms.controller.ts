import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import type { CurrentUserType } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { SkipTermsCheck } from './decorators/skip-terms-check.decorator';
import { AgreeTermsDto } from './dto/agree-terms.dto';
import { LatestTermsResponseDto } from './dto/response/latest-terms-response.dto';
import { TermsService } from './terms.service';

@ApiTags('terms')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@SkipTermsCheck()
@Controller('terms')
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Get('latest')
  @ApiOperation({
    summary: '최신 약관 목록 조회',
    description:
      '현재 발효된(effective_at <= NOW()) 각 kind별 최신 버전 약관 목록을 반환한다. ' +
      '사용자 언어에 맞는 본문이 없으면 content=null, contentLanguage=null로 반환된다. ' +
      '미동의 사용자도 접근 가능하다.',
  })
  @ApiOkResponse({
    description: '최신 약관 목록',
    type: [LatestTermsResponseDto],
  })
  async listLatest(
    @CurrentUser() user: CurrentUserType,
  ): Promise<LatestTermsResponseDto[]> {
    const entities = await this.termsService.listLatestForUser(user.uuid);
    return entities.map((e) => LatestTermsResponseDto.fromEntity(e));
  }

  @Post(':uuid/agree')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '약관 동의 / 철회',
    description:
      '지정한 약관에 동의하거나 철회한다. append-only로 기록되므로 ' +
      '같은 약관에 여러 번 호출해도 dedupe하지 않는다. ' +
      '미동의 사용자도 접근 가능하다.',
  })
  @ApiNoContentResponse({ description: '처리 완료 (응답 본문 없음)' })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.TERMS_NOT_FOUND })
  async agree(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() dto: AgreeTermsDto,
    @Req() req: Request,
  ): Promise<void> {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    await this.termsService.agreeTerms(user.uuid, uuid, dto.agreed, ip, ua);
  }
}
