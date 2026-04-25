// DTO for the admin certificate reissue endpoint.
//
// The reissue flow is currently audit-only: the admin records that a
// reissue should happen, the existing certificate is revoked with reason
// "superseded", and the user is expected to issue a fresh certificate from
// their own app (the only place the encrypted private key may be touched).
// A `reason` is still required so the audit trail captures justification.
import { IsString, IsNotEmpty, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReissueCertificateDto {
  @ApiProperty({
    description:
      'Reason for requesting reissue — recorded on the audit log and on ' +
      'the revoked certificate that the new one will replace.',
    example: 'Subject name changed after legal name update',
    minLength: 5,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Reason must be at least 5 characters.' })
  @MaxLength(500, { message: 'Reason must be 500 characters or fewer.' })
  reason!: string;
}
