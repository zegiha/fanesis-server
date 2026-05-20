import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AppException } from '../exceptions/app.exception';

interface ErrorResponseBody {
  [key: string]: unknown;
  statusCode: number;
  message: string | string[];
  error: string;
  errorCode?: string;
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<unknown>();
    const path: string =
      (httpAdapter.getRequestUrl(request) as string | undefined) ?? '';
    const timestamp = new Date().toISOString();

    let statusCode: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        message = response;
        error = exception.name;
      } else {
        const responseObj = response as {
          message?: string | string[];
          error?: string;
        };
        message = responseObj.message ?? exception.message;
        error = responseObj.error ?? exception.name;
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';
    }

    const extras =
      exception instanceof AppException ? (exception.extras ?? {}) : {};

    const body: ErrorResponseBody = {
      ...extras,
      statusCode,
      message,
      error,
      timestamp,
      path,
    };

    if (exception instanceof AppException) {
      body.errorCode = exception.errorCode;
    }

    if (statusCode >= 500) {
      this.logger.error(
        `${statusCode} ${path} - ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${statusCode} ${path} - ${JSON.stringify(message)}`);
    }

    httpAdapter.reply(ctx.getResponse(), body, statusCode);
  }
}
