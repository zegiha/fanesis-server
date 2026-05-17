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
import { CreateTaskDto } from './dto/create-task.dto';
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

  @Get()
  @ApiOperation({
    summary: '내 태스크 목록 조회',
    description: '현재 로그인된 유저의 모든 태스크를 최신순으로 반환한다.',
  })
  @ApiOkResponse({ description: '태스크 목록', type: [TaskResponseDto] })
  async findAll(
    @CurrentUser() user: CurrentUserType,
  ): Promise<TaskResponseDto[]> {
    const tasks = await this.taskService.findAll(user.uuid);
    return tasks.map((t) => TaskResponseDto.fromEntity(t));
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
