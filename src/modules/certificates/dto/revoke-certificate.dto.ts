// DTO for the admin certificate revoke endpoint. The CRL reason code is
// captured separately from the free-form `reason` so it can later be
// included in CRL/OCSP responses without re-deriving it.
import { IsString, IsNotEmpty, IsIn, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** RFC 5280 CRL reason codes that the admin UI exposes today. */
export type CrlReasonCode =
  | 'keyCompromise'
  | 'affiliationChanged'
  | 'superseded'
  | 'cessationOfOperation'
  | 'unspecified';

const CRL_REASON_CODES: CrlReasonCode[] = [
  'keyCompromise',
  'affiliationChanged',
  'superseded',
  'cessationOfOperation',
  'unspecified',
];

export class RevokeCertificateDto {
  @ApiProperty({
    description:
      'Free-form reason captured for the audit log and persisted on the ' +
      'certificate row as `revokedReason`.',
    example: 'Key compromise reported by the user on 2026-04-19',
    minLength: 5,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Reason must be at least 5 characters.' })
  @MaxLength(500, { message: 'Reason must be 500 characters or fewer.' })
  reason!: string;

  @ApiProperty({
    description: 'Standardised CRL reason code per RFC 5280.',
    enum: CRL_REASON_CODES,
  })
  @IsIn(CRL_REASON_CODES)
  crlReasonCode!: CrlReasonCode;
}
