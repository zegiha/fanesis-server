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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import { PaginationQueryDto } from '@/common/dtos/pagination-query.dto';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import type { CurrentUserType } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { ByDateTaskQueryDto } from './dto/query/by-date-task-query.dto';
import { PaginatedTaskResponseDto } from './dto/response/paginated-task-response.dto';
import { TaskResponseDto } from './dto/response/task-response.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskService } from './task.service';

@ApiTags('task')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @ApiOperation({
    summary: '태스크 생성',
    description:
      '현재 로그인된 유저의 태스크를 생성한다. backlogKind=folder인 경우 backlogFolderId는 본인 소유 폴더여야 한다.',
  })
  @ApiCreatedResponse({ description: '생성된 태스크', type: TaskResponseDto })
  @ApiErrorResponse({
    status: 400,
    errorCode: ErrorCode.TASK_INVALID_STATE,
  })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.FOLDER_NOT_FOUND })
  @ApiErrorResponse({
    status: 409,
    errorCode: ErrorCode.TASK_BIG3_LIMIT_EXCEEDED,
  })
  async create(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    const task = await this.taskService.create(user.uuid, dto);
    return TaskResponseDto.fromEntity(task);
  }

  @Get('inbox')
  @ApiOperation({
    summary: 'Inbox 태스크 목록 (페이지네이션)',
    description:
      'backlogKind=inbox 이면서 미완료(doneDate IS NULL)인 태스크를 최신순(createdAt desc)으로 반환한다.',
  })
  @ApiOkResponse({
    description: 'Inbox 페이지네이션 결과',
    type: PaginatedTaskResponseDto,
  })
  async findInbox(
    @CurrentUser() user: CurrentUserType,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedTaskResponseDto> {
    const { items, total } = await this.taskService.findInbox(
      user.uuid,
      query.page,
      query.limit,
    );
    return PaginatedTaskResponseDto.fromEntities(
      items,
      total,
      query.page,
      query.limit,
    );
  }

  @Get('by-folder/:folderUuid')
  @ApiOperation({
    summary: '폴더별 태스크 목록',
    description:
      '지정한 폴더에 속하면서 미완료(doneDate IS NULL)인 태스크를 최신순으로 반환한다. 폴더가 존재하지 않거나 본인 소유가 아니면 404.',
  })
  @ApiOkResponse({ description: '태스크 목록', type: [TaskResponseDto] })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.FOLDER_NOT_FOUND })
  async findByFolder(
    @CurrentUser() user: CurrentUserType,
    @Param('folderUuid', new ParseUUIDPipe()) folderUuid: string,
  ): Promise<TaskResponseDto[]> {
    const tasks = await this.taskService.findByFolder(user.uuid, folderUuid);
    return tasks.map((t) => TaskResponseDto.fromEntity(t));
  }

  @Get('by-date')
  @ApiOperation({
    summary: '예약 날짜별 태스크 목록',
    description:
      '지정한 날짜에 예약된(scheduled_date = :date) 태스크를 시작시간 오름차순으로 반환한다. 완료된 태스크도 포함되며 클라이언트는 doneDate로 완료 여부를 판단한다.',
  })
  @ApiOkResponse({ description: '태스크 목록', type: [TaskResponseDto] })
  async findByDate(
    @CurrentUser() user: CurrentUserType,
    @Query() query: ByDateTaskQueryDto,
  ): Promise<TaskResponseDto[]> {
    const tasks = await this.taskService.findByDate(user.uuid, query.date);
    return tasks.map((t) => TaskResponseDto.fromEntity(t));
  }

  @Get('done')
  @ApiOperation({
    summary: '완료된 태스크 목록 (페이지네이션)',
    description:
      'doneDate IS NOT NULL인 태스크를 완료시각 내림차순으로 반환한다.',
  })
  @ApiOkResponse({
    description: '완료 태스크 페이지네이션 결과',
    type: PaginatedTaskResponseDto,
  })
  async findDone(
    @CurrentUser() user: CurrentUserType,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedTaskResponseDto> {
    const { items, total } = await this.taskService.findDone(
      user.uuid,
      query.page,
      query.limit,
    );
    return PaginatedTaskResponseDto.fromEntities(
      items,
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':uuid')
  @ApiOperation({
    summary: '태스크 단건 조회',
    description: '본인 소유 태스크만 조회 가능. 그 외는 404로 응답한다.',
  })
  @ApiOkResponse({ description: '태스크 상세', type: TaskResponseDto })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.TASK_NOT_FOUND })
  async findOne(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
  ): Promise<TaskResponseDto> {
    const task = await this.taskService.findOne(user.uuid, uuid);
    return TaskResponseDto.fromEntity(task);
  }

  @Patch(':uuid')
  @ApiOperation({
    summary: '태스크 수정',
    description:
      '본인 소유 태스크의 필드를 부분 업데이트한다. 변경 후 상태가 일관성 규칙을 위반하면 400.',
  })
  @ApiOkResponse({ description: '수정된 태스크', type: TaskResponseDto })
  @ApiErrorResponse({ status: 400, errorCode: ErrorCode.TASK_INVALID_STATE })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.TASK_NOT_FOUND })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.FOLDER_NOT_FOUND })
  @ApiErrorResponse({
    status: 409,
    errorCode: ErrorCode.TASK_BIG3_LIMIT_EXCEEDED,
  })
  async update(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    const task = await this.taskService.update(user.uuid, uuid, dto);
    return TaskResponseDto.fromEntity(task);
  }

  @Delete(':uuid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '태스크 삭제',
    description: '본인 소유 태스크를 영구 삭제한다.',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.TASK_NOT_FOUND })
  async remove(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
  ): Promise<void> {
    await this.taskService.remove(user.uuid, uuid);
  }
}
