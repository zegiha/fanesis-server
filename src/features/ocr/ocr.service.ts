import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly client: ImageAnnotatorClient;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('googleVision.apiKey') ?? '';
    this.client = new ImageAnnotatorClient({ apiKey: apiKey || undefined });
  }

  async analyze(imageBuffer: Buffer, languageHints: string[]): Promise<string> {
    try {
      const [result] = await this.client.documentTextDetection({
        image: { content: imageBuffer.toString('base64') },
        imageContext: { languageHints },
      });
      return (result.fullTextAnnotation?.text ?? '').replace(/\n/g, ' ').trim();
    } catch (error) {
      this.logger.error('Google Vision OCR failed', error);
      return '';
    }
  }
}
