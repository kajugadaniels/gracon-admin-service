import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Used by the admin frontend to validate the invite token
// before showing the set-password form.
// Prevents showing the form when the link is already expired or used.
export class ValidateInviteDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Admin UUID from the invite link query parameter.',
  })
  @IsUUID('4', { message: 'Invalid invite link.' })
  adminId: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Raw invite token from the invite link query parameter.',
  })
  @IsString()
  token: string;
}
