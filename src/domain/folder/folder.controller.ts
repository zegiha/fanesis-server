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
import { CreateFolderDto } from './dto/create-folder.dto';
import { FolderResponseDto } from './dto/response/folder-response.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { FolderService } from './folder.service';

@ApiTags('folder')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('folders')
export class FolderController {
  constructor(private readonly folderService: FolderService) {}

  @Post()
  @ApiOperation({
    summary: '폴더 생성',
    description:
      '현재 로그인된 유저의 폴더를 생성한다. 같은 유저 내 이름은 대소문자 무시 중복 불가.',
  })
  @ApiCreatedResponse({ description: '생성된 폴더', type: FolderResponseDto })
  @ApiErrorResponse({
    status: 409,
    errorCode: ErrorCode.FOLDER_NAME_DUPLICATED,
  })
  async create(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: CreateFolderDto,
  ): Promise<FolderResponseDto> {
    const folder = await this.folderService.create(user.uuid, dto);
    return FolderResponseDto.fromEntity(folder);
  }

  @Get()
  @ApiOperation({
    summary: '내 폴더 목록 조회',
    description: '현재 로그인된 유저의 모든 폴더를 최신순으로 반환한다.',
  })
  @ApiOkResponse({ description: '폴더 목록', type: [FolderResponseDto] })
  async findAll(
    @CurrentUser() user: CurrentUserType,
  ): Promise<FolderResponseDto[]> {
    const folders = await this.folderService.findAll(user.uuid);
    return folders.map((f) => FolderResponseDto.fromEntity(f));
  }

  @Get(':uuid')
  @ApiOperation({
    summary: '폴더 단건 조회',
    description: '본인 소유 폴더만 조회 가능. 그 외는 404.',
  })
  @ApiOkResponse({ description: '폴더 상세', type: FolderResponseDto })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.FOLDER_NOT_FOUND })
  async findOne(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
  ): Promise<FolderResponseDto> {
    const folder = await this.folderService.findOne(user.uuid, uuid);
    return FolderResponseDto.fromEntity(folder);
  }

  @Patch(':uuid')
  @ApiOperation({
    summary: '폴더 수정',
    description:
      '본인 소유 폴더의 name/color를 부분 업데이트. name 변경 시 중복 검사.',
  })
  @ApiOkResponse({ description: '수정된 폴더', type: FolderResponseDto })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.FOLDER_NOT_FOUND })
  @ApiErrorResponse({
    status: 409,
    errorCode: ErrorCode.FOLDER_NAME_DUPLICATED,
  })
  async update(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() dto: UpdateFolderDto,
  ): Promise<FolderResponseDto> {
    const folder = await this.folderService.update(user.uuid, uuid, dto);
    return FolderResponseDto.fromEntity(folder);
  }

  @Delete(':uuid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '폴더 삭제',
    description:
      '본인 소유 폴더를 삭제한다. 폴더에 속한 task들은 같은 트랜잭션 안에서 inbox로 변환된다.',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.FOLDER_NOT_FOUND })
  async remove(
    @CurrentUser() user: CurrentUserType,
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
  ): Promise<void> {
    await this.folderService.remove(user.uuid, uuid);
  }
}
