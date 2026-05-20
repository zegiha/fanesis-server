import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import type { CurrentUserType } from '@/core/auth/decorators/current-user.decorator';
import { UserResponseDto } from '@/core/auth/dto/response/user-response.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { UpdateTimezoneDto } from './dto/update-timezone.dto';
import { UserService } from './user.service';

@ApiTags('user')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Patch('me/timezone')
  @ApiOperation({
    summary: '내 timezone 변경',
    description:
      '현재 로그인된 유저의 timezone을 변경한다. ' +
      'timezone === "Asia/Seoul"이면 language=ko, 그 외는 language=en으로 함께 갱신된다.',
  })
  @ApiOkResponse({ description: '변경된 유저 정보', type: UserResponseDto })
  @ApiErrorResponse({ status: 404, errorCode: ErrorCode.USER_NOT_FOUND })
  async updateTimezone(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: UpdateTimezoneDto,
  ): Promise<UserResponseDto> {
    const updated = await this.userService.updateTimezone(
      user.uuid,
      dto.timezone,
    );
    return UserResponseDto.fromEntity(updated);
  }
}
