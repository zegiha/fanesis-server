import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import type { CurrentUserType } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { CanvasService } from './canvas.service';
import { CanvasUploadUrlDto } from './dto/request/canvas-upload-url.dto';
import { ConfirmCanvasDto } from './dto/request/confirm-canvas.dto';
import { CanvasResponseDto } from './dto/response/canvas-response.dto';
import { CanvasUploadUrlResponseDto } from './dto/response/canvas-upload-url-response.dto';
import { OcrUploadUrlResponseDto } from './dto/response/ocr-upload-url-response.dto';

@ApiTags('canvas')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('canvases')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @Post('upload-url')
  @HttpCode(201)
  @ApiOperation({ summary: 'PencilKit 데이터 업로드 URL 발급' })
  @ApiResponse({ status: 201, type: CanvasUploadUrlResponseDto })
  async getUploadUrl(
    @Body() dto: CanvasUploadUrlDto,
    @CurrentUser() user: CurrentUserType,
  ): Promise<CanvasUploadUrlResponseDto> {
    return this.canvasService.getUploadUrl(user.uuid, dto.date);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Canvas 업로드 확인 및 저장' })
  @ApiResponse({ status: 200, type: CanvasResponseDto })
  @ApiErrorResponse({
    status: 409,
    errorCode: ErrorCode.CANVAS_UPLOAD_NOT_CONFIRMED,
    description: 'R2 스토리지에 파일이 존재하지 않음 (업로드 미완료)',
  })
  async confirmUpload(
    @Body() dto: ConfirmCanvasDto,
    @CurrentUser() user: CurrentUserType,
  ): Promise<CanvasResponseDto> {
    const canvas = await this.canvasService.confirmUpload(
      user.uuid,
      dto.date,
      dto.versionKey,
    );
    return CanvasResponseDto.fromEntity(canvas);
  }

  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: '날짜로 Canvas 조회' })
  @ApiQuery({
    name: 'date',
    type: String,
    description: '조회할 날짜 (YYYY-MM-DD)',
    example: '2026-05-19',
  })
  @ApiResponse({ status: 200, type: CanvasResponseDto })
  @ApiErrorResponse({
    status: 404,
    errorCode: ErrorCode.CANVAS_NOT_FOUND,
    description: '해당 날짜에 Canvas가 존재하지 않음',
  })
  async findByDate(
    @Query('date') date: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<CanvasResponseDto> {
    const canvas = await this.canvasService.findByDate(user.uuid, date);
    return CanvasResponseDto.fromEntity(canvas);
  }

  @Post(':uuid/ocr/upload-url')
  @HttpCode(201)
  @ApiOperation({ summary: 'OCR 이미지 업로드 URL 발급' })
  @ApiResponse({ status: 201, type: OcrUploadUrlResponseDto })
  @ApiErrorResponse({
    status: 404,
    errorCode: ErrorCode.CANVAS_NOT_FOUND,
    description: '해당 UUID의 Canvas가 존재하지 않거나 접근 권한 없음',
  })
  async getOcrUploadUrl(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<OcrUploadUrlResponseDto> {
    return this.canvasService.getOcrUploadUrl(user.uuid, uuid);
  }
}
