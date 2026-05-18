import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';

export class CalendarOauthStateInvalidException extends AppException {
  constructor() {
    super(
      ErrorCode.CALENDAR_OAUTH_STATE_INVALID,
      'OAuth state token is invalid or expired',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class CalendarOauthCodeExchangeFailedException extends AppException {
  constructor(detail = 'Failed to exchange authorization code for tokens') {
    super(
      ErrorCode.CALENDAR_OAUTH_CODE_EXCHANGE_FAILED,
      detail,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class CalendarIntegrationNotFoundException extends AppException {
  constructor() {
    super(
      ErrorCode.CALENDAR_INTEGRATION_NOT_FOUND,
      'Calendar integration not found',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class CalendarNotSubscribedException extends AppException {
  constructor() {
    super(
      ErrorCode.CALENDAR_NOT_SUBSCRIBED,
      'Calendar is not subscribed',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class CalendarGoogleApiException extends AppException {
  constructor(detail = 'Upstream Google API error') {
    super(ErrorCode.CALENDAR_GOOGLE_API_ERROR, detail, HttpStatus.BAD_GATEWAY);
  }
}

export class CalendarTokenRefreshFailedException extends AppException {
  constructor() {
    super(
      ErrorCode.CALENDAR_TOKEN_REFRESH_FAILED,
      'Failed to refresh Google access token — re-authentication required',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class CalendarWebhookUnknownChannelException extends AppException {
  constructor() {
    super(
      ErrorCode.CALENDAR_WEBHOOK_UNKNOWN_CHANNEL,
      'Webhook channel not recognized',
      HttpStatus.NOT_FOUND,
    );
  }
}
