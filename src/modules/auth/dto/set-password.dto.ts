import { IsString, IsUUID, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPasswordDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description:
      'UUID of the admin account. ' +
      'Extracted from the invite link query parameter ?adminId=',
  })
  @IsUUID('4', { message: 'Invalid invite link — adminId is malformed.' })
  adminId: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'Raw invite token from the email link query parameter ?token= ' +
      'This is a one-time token. It expires after 48 hours and ' +
      'becomes invalid immediately after use.',
  })
  @IsString()
  token: string;

  @ApiProperty({
    example: 'MyStr0ng!Pass#2024',
    description:
      'Chosen password for the new admin account. ' +
      'Requirements: minimum 8 characters, at least one uppercase letter, ' +
      'one lowercase letter, one digit, and one special character (@$!%*?&^#).',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @Length(8, 128, { message: 'Password must be between 8 and 128 characters.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])/, {
    message:
      'Password must include uppercase, lowercase, a digit, ' +
      'and a special character (@$!%*?&^#).',
  })
  password: string;
}
