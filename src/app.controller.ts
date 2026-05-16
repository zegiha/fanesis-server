import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/heartbeat')
  @ApiOperation({
    summary: '서버 헬스 체크',
    description: '서버가 정상 동작 중인지 확인하는 엔드포인트',
  })
  @ApiOkResponse({
    description: '서버 정상',
    schema: { type: 'string', example: 'OK' },
  })
  getHeartbeat(): string {
    return this.appService.getHeartbeat();
  }
}
