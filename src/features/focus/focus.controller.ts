import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import type { CurrentUserType } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RequiredTermsGuard } from '@/domain/terms/guards/required-terms.guard';
import { ByDateFocusSessionQueryDto } from './dto/query/by-date-focus-session-query.dto';
import { FocusSessionResponseDto } from './dto/response/focus-session-response.dto';
import { StartFocusSessionDto } from './dto/start-focus-session.dto';
import { FocusService } from './focus.service';

@ApiTags('focus')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RequiredTermsGuard)
@ApiErrorResponse({
  status: 403,
  errorCode: ErrorCode.REQUIRED_TERMS_NOT_AGREED,
  description: '필수 약관 미동의 — 응답 body에 missingTerms 배열 포함',
})
@ApiExtraModels(FocusSessionResponseDto)
@Controller('focus-sessions')
export class FocusController {
  constructor(private readonly focusService: FocusService) {}

  @Post()
  @ApiOperation({
    summary: '집중 세션 시작',
    description:
      'taskUuid는 시작 시점 필수. 사용자당 동시에 active 세션 1개만 허용 (partial unique index). 본인 소유가 아닌 task UUID는 404로 응답.',
  })
  @ApiCreatedResponse({
    description: '생성된 focus session',
    type: FocusSessionResponseDto,
  })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.TASK_NOT_FOUND })
  @ApiErrorResponse({
    status: 409,
    errorCode: ErrorCode.FOCUS_SESSION_ALREADY_ACTIVE,
  })
  async start(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: StartFocusSessionDto,
  ): Promise<FocusSessionResponseDto> {
    const session = await this.focusService.start(user.uuid, dto);
    return FocusSessionResponseDto.fromEntity(session);
  }

  @Get('active')
  @ApiOperation({
    summary: '현재 active 세션 조회',
    description:
      '진행 중인(ended_at IS NULL) 세션이 있으면 반환, 없으면 body=null. 클라이언트의 active 세션 복구·동기화용.',
  })
  @ApiOkResponse({
    description: 'active 세션 또는 null',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(FocusSessionResponseDto) },
        { type: 'null' },
      ],
    },
  })
  async getActive(
    @CurrentUser() user: CurrentUserType,
  ): Promise<FocusSessionResponseDto | null> {
    const session = await this.focusService.getActive(user.uuid);
    return session ? FocusSessionResponseDto.fromEntity(session) : null;
  }

  @Get()
  @ApiOperation({
    summary: '일자별 focus 세션 목록',
    description:
      '사용자 timezone(users.timezone) 기준으로 started_at이 해당 날짜에 속한 모든 세션을 반환 (focus/break 모두, active 포함). startedAt DESC.',
  })
  @ApiOkResponse({
    description: '세션 배열',
    type: [FocusSessionResponseDto],
  })
  async findByDate(
    @CurrentUser() user: CurrentUserType,
    @Query() query: ByDateFocusSessionQueryDto,
  ): Promise<FocusSessionResponseDto[]> {
    const sessions = await this.focusService.findByDate(user.uuid, query.date);
    return sessions.map((s) => FocusSessionResponseDto.fromEntity(s));
  }

  @Patch(':uuid/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '집중 세션 종료',
    description: 'endedAt에 현재 시각을 기록한다. 이미 종료된 세션이면 409.',
  })
  @ApiOkResponse({
    description: '종료된 focus session',
    type: FocusSessionResponseDto,
  })
  @ApiErrorResponse({
    status: 404,
    errorCode: ErrorCode.FOCUS_SESSION_NOT_FOUND,
  })
  @ApiErrorResponse({
    status: 409,
    errorCode: ErrorCode.FOCUS_SESSION_ALREADY_ENDED,
  })
  async end(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
  ): Promise<FocusSessionResponseDto> {
    const session = await this.focusService.end(user.uuid, uuid);
    return FocusSessionResponseDto.fromEntity(session);
  }

  @Delete(':uuid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '세션 단건 삭제 (hard delete)',
    description:
      '클라이언트가 active 세션을 정상 종료하지 못한 경우 강제 정리용. active/종료 상태 무관, 미존재면 404.',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @ApiErrorResponse({
    status: 404,
    errorCode: ErrorCode.FOCUS_SESSION_NOT_FOUND,
  })
  async remove(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
  ): Promise<void> {
    await this.focusService.remove(user.uuid, uuid);
  }
}
