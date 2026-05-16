import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type CurrentUserType = { uuid: string };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserType => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user: CurrentUserType }>();
    return req.user;
  },
);
