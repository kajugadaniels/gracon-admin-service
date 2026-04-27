import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReviewCertificateRequestDto {
  @ApiProperty({
    description: 'Reason recorded on approval or rejection audit entries.',
    example:
      'Identity verification evidence and key ownership were reviewed by the platform security team.',
    minLength: 20,
    maxLength: 500,
  })
  @IsString()
  @MinLength(20, { message: 'Reason must be at least 20 characters.' })
  @MaxLength(500, { message: 'Reason must be 500 characters or fewer.' })
  reason!: string;
}
