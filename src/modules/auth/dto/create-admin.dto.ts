import {
  IsEmail,
  IsString,
  IsOptional,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAdminDto {
  @ApiProperty({
    example: 'Ishimwe',
    description: 'First name of the new admin.',
    minLength: 2,
    maxLength: 64,
  })
  @IsString()
  @Length(2, 64, { message: 'First name must be between 2 and 64 characters.' })
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @ApiProperty({
    example: 'Patrick',
    description: 'Last name (surname) of the new admin.',
    minLength: 2,
    maxLength: 64,
  })
  @IsString()
  @Length(2, 64, { message: 'Last name must be between 2 and 64 characters.' })
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @ApiProperty({
    example: 'ishimwe.patrick@idverify.rw',
    description:
      'Email address for the new admin. ' +
      'An invite link will be sent here. ' +
      'Must be unique across all admin accounts.',
  })
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiPropertyOptional({
    example: '+250788123456',
    description:
      'Phone number in E.164 format. Optional at creation. ' +
      'Useful for 2FA or emergency contact.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[\d\s\-()\\.]{7,20}$/, {
    message: 'Please provide a valid phone number.',
  })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.trim())
  phoneNumber?: string;
}
