export const OCR_QUEUE = 'ocr';

export const OcrJob = {
  Process: 'process',
} as const;

export interface OcrJobPayload {
  canvasUuid: string;
  ocrKey: string;
  ocrImageKey: string;
  userId: string;
  userTimezone: string;
}
