import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Length } from 'class-validator';

export enum AccentColorKeyDto {
  red = 'red',
  orange = 'orange',
  yellow = 'yellow',
  green = 'green',
  blue = 'blue',
  violet = 'violet',
  gray = 'gray',
}

export class CreateFolderDto {
  @ApiProperty({
    description: '폴더 이름 (1~100자, 같은 유저 내 대소문자 무시 중복 불가)',
    example: '운동',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name!: string;

  @ApiProperty({
    description: '폴더 강조 색상',
    enum: AccentColorKeyDto,
    example: AccentColorKeyDto.blue,
  })
  @IsEnum(AccentColorKeyDto)
  color!: AccentColorKeyDto;
}
