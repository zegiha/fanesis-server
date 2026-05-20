import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import type { CurrentUserType } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RequiredTermsGuard } from '@/domain/terms/guards/required-terms.guard';
import { CalendarLinkService } from './calendar-link.service';
import { AuthorizeResponseDto } from './dto/authorize-response.dto';
import { AvailableCalendarDto } from './dto/available-calendar.dto';
import { SubscribeCalendarsDto } from './dto/subscribe-calendars.dto';
import { SyncedCalendarResponseDto } from './dto/response/synced-calendar.dto';

@ApiTags('calendar-link')
@ApiErrorResponse({
  status: 403,
  errorCode: ErrorCode.REQUIRED_TERMS_NOT_AGREED,
  description: '필수 약관 미동의 — 응답 body에 missingTerms 배열 포함',
})
@Controller('calendar-link/google')
export class CalendarLinkController {
  constructor(private readonly service: CalendarLinkService) {}

  @Get('authorize')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RequiredTermsGuard)
  @ApiOperation({
    summary: 'Google Calendar 연결을 위한 authorize URL 발급',
    description:
      '클라이언트는 응답의 authorizeUrl을 ASWebAuthenticationSession 등으로 열어 사용자 동의를 받는다. ' +
      'state는 10분 수명의 JWT로 서명되어 callback에서 검증된다.',
  })
  @ApiOkResponse({ type: AuthorizeResponseDto })
  authorize(@CurrentUser() user: CurrentUserType): AuthorizeResponseDto {
    return AuthorizeResponseDto.of(this.service.buildAuthorizeUrl(user.uuid));
  }

  @Get('callback')
  @ApiExcludeEndpoint()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const deepLink = await this.service.handleCallback(code, state, error);
    res.redirect(HttpStatus.FOUND, deepLink);
  }

  @Get('calendars')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RequiredTermsGuard)
  @ApiOperation({
    summary: '연결된 Google 계정의 캘린더 목록 조회',
    description:
      '사용자가 어떤 캘린더를 구독할지 선택할 수 있도록 가용 캘린더와 현재 구독 여부를 반환한다.',
  })
  @ApiOkResponse({ type: [AvailableCalendarDto] })
  @ApiErrorResponse({
    status: 404,
    errorCode: ErrorCode.CALENDAR_INTEGRATION_NOT_FOUND,
  })
  listCalendars(
    @CurrentUser() user: CurrentUserType,
  ): Promise<AvailableCalendarDto[]> {
    return this.service.listAvailableCalendars(user.uuid);
  }

  @Post('calendars/subscribe')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RequiredTermsGuard)
  @ApiOperation({
    summary: '캘린더 구독 (초기 동기화 + push 채널 등록)',
    description:
      '지정한 Google calendar 들을 구독한다. 비동기로 초기 sync 잡과 채널 등록이 진행된다.',
  })
  @ApiCreatedResponse({ type: [SyncedCalendarResponseDto] })
  @ApiErrorResponse({
    status: 404,
    errorCode: ErrorCode.CALENDAR_INTEGRATION_NOT_FOUND,
  })
  async subscribe(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: SubscribeCalendarsDto,
  ): Promise<SyncedCalendarResponseDto[]> {
    const subs = await this.service.subscribeCalendars(
      user.uuid,
      dto.externalCalendarIds,
    );
    return subs.map((s) => SyncedCalendarResponseDto.fromEntity(s));
  }

  @Delete('calendars/:uuid')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RequiredTermsGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '캘린더 구독 해제',
    description:
      'push 채널을 stop하고 구독을 비활성화한다. 기존 task는 남는다.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponse({
    status: 404,
    errorCode: ErrorCode.CALENDAR_NOT_SUBSCRIBED,
  })
  unsubscribe(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
  ): Promise<void> {
    return this.service.unsubscribeCalendar(user.uuid, uuid);
  }

  @Delete()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RequiredTermsGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Google Calendar 연결 해제',
    description: '모든 구독 캘린더를 정리하고 OAuth 통합을 삭제한다.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponse({
    status: 404,
    errorCode: ErrorCode.CALENDAR_INTEGRATION_NOT_FOUND,
  })
  disconnect(@CurrentUser() user: CurrentUserType): Promise<void> {
    return this.service.disconnect(user.uuid);
  }
}
