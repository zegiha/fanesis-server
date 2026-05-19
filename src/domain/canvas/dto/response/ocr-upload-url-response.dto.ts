import { ApiProperty } from '@nestjs/swagger';

export class OcrUploadUrlResponseDto {
  @ApiProperty({
    description: 'R2 오브젝트 스토리지 OCR 이미지 업로드용 Presigned PUT URL',
    example:
      'https://bucket.r2.cloudflarestorage.com/ocr/canvas-uuid/abc123.jpg?X-Amz-Signature=...',
  })
  presignedUrl!: string;

  @ApiProperty({
    description: 'OCR 처리 요청 시 사용할 OCR 토큰 (5분 유효)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  ocrToken!: string;
}
