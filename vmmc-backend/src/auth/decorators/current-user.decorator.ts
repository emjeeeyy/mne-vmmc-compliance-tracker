import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { RequestWithEmployee } from '../types/request-with-employee';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithEmployee>();
  return request.employee;
});
