import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CertificateAccessPolicyReasonDto {
  @ApiProperty({
    description:
      'Documented reason shown in audit history and surfaced to the user where appropriate.',
    minLength: 20,
    maxLength: 500,
    example:
      'Repeated unauthorized signing attempts require manual trust review.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(20, { message: 'Reason must be at least 20 characters.' })
  @MaxLength(500, { message: 'Reason must be 500 characters or fewer.' })
  reason!: string;
}
