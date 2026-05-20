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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import type { CurrentUserType } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RequiredTermsGuard } from '@/domain/terms/guards/required-terms.guard';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { RoutineResponseDto } from './dto/response/routine-response.dto';
import { RoutineService } from './routine.service';

@ApiTags('routine')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RequiredTermsGuard)
@ApiErrorResponse({
  status: 403,
  errorCode: ErrorCode.REQUIRED_TERMS_NOT_AGREED,
  description: '필수 약관 미동의 — 응답 body에 missingTerms 배열 포함',
})
@Controller('routines')
export class RoutineController {
  constructor(private readonly routineService: RoutineService) {}

  @Post()
  @ApiOperation({
    summary: '루틴 생성 (신규 또는 "수정" 의도의 새 버전)',
    description:
      'lineageUuid를 함께 전달하면 같은 논리적 routine의 새 버전으로 묶인다. 생략 시 서버가 새 lineage를 발급. 클라이언트는 "수정" UX를 DELETE + 같은 lineageUuid로 새 POST 패턴으로 처리한다.',
  })
  @ApiCreatedResponse({ description: '생성된 루틴', type: RoutineResponseDto })
  @ApiErrorResponse({
    status: 400,
    errorCode: ErrorCode.ROUTINE_INVALID_STATE,
  })
  @ApiErrorResponse({
    status: 400,
    errorCode: ErrorCode.ROUTINE_LINEAGE_NOT_FOUND,
  })
  async create(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: CreateRoutineDto,
  ): Promise<RoutineResponseDto> {
    const routine = await this.routineService.create(user.uuid, dto);
    return RoutineResponseDto.fromEntity(routine);
  }

  @Get()
  @ApiOperation({
    summary: '내 루틴 목록 조회',
    description:
      '소프트 삭제된 routine도 포함해서 모두 반환한다. 클라이언트는 occurrence 시각과 deletedAt을 비교해 렌더링 여부를 판단한다.',
  })
  @ApiOkResponse({ description: '루틴 목록', type: [RoutineResponseDto] })
  async findAll(
    @CurrentUser() user: CurrentUserType,
  ): Promise<RoutineResponseDto[]> {
    const routines = await this.routineService.findAll(user.uuid);
    return routines.map((r) => RoutineResponseDto.fromEntity(r));
  }

  @Get(':uuid')
  @ApiOperation({
    summary: '루틴 단건 조회 (soft delete 포함)',
    description: '본인 소유 routine만 조회 가능. 그 외는 404.',
  })
  @ApiOkResponse({ description: '루틴 상세', type: RoutineResponseDto })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.ROUTINE_NOT_FOUND })
  async findOne(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
  ): Promise<RoutineResponseDto> {
    const routine = await this.routineService.findOne(user.uuid, uuid);
    return RoutineResponseDto.fromEntity(routine);
  }

  @Delete(':uuid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '루틴 소프트 삭제 (멱등)',
    description:
      'deleted_at에 현재 시각을 기록한다. 이미 삭제된 경우에도 기존 deleted_at을 유지하며 204를 반환한다 (멱등).',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.ROUTINE_NOT_FOUND })
  async remove(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
  ): Promise<void> {
    await this.routineService.remove(user.uuid, uuid);
  }
}
