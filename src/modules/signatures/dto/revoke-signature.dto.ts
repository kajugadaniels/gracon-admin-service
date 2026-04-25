// DTO for the admin signature revoke endpoint.
// `reason` is required so the audit log always carries a free-form
// justification next to the structured action enum.
import { IsString, IsNotEmpty, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RevokeSignatureDto {
  @ApiProperty({
    description:
      'Free-form reason explaining why the signature is being revoked. ' +
      'Stored on the linked certificate and on the AdminAuditLog metadata.',
    example: 'Reported as compromised by the user on 2026-04-19',
    minLength: 5,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Reason must be at least 5 characters.' })
  @MaxLength(500, { message: 'Reason must be 500 characters or fewer.' })
  reason!: string;
}
