import { IsBoolean, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateIdVerificationDto {
  @ApiProperty({
    description:
      'Set to true to manually mark the user as ID-verified. ' +
      'Set to false to revoke their verification status. ' +
      'Use with extreme caution — this bypasses the AI verification process.',
    example: true,
  })
  @IsBoolean()
  isIdVerified: boolean;

  @ApiPropertyOptional({
    description:
      'Reason for the manual override. ' +
      'Mandatory when revoking verification. ' +
      'Always recorded in AdminAuditLog.',
    example:
      'Physical document verification completed in-person at Kigali office.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
