import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'CLOSED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export class UpdateLeadStatusDto {
  @ApiProperty({ enum: LEAD_STATUSES, example: 'CONTACTED' })
  @IsString()
  @IsIn(LEAD_STATUSES)
  status: LeadStatus;

  @ApiPropertyOptional({
    example: 'Called user, scheduled consultation next Tuesday',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
