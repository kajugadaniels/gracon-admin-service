import { IsEmail, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({
    example: 'ishimwe.patrick@idverify.rw',
    description: 'The registered admin email address.',
  })
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    example: 'Secur3P@ssw0rd!',
    description: 'Admin account password. Must meet complexity requirements.',
  })
  @IsString()
  @Length(1, 128, { message: 'Password is required.' })
  password: string;
}
