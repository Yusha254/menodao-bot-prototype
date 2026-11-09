import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { AssemblyAiModule } from '../assemblyai/assemblyai.module';
import { VoicePipelineService } from './voice-pipeline.service';

import { BookingModule } from '../booking/booking.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AiModule,
    AssemblyAiModule,
    BookingModule,
  ],
  providers: [VoicePipelineService],
  exports: [VoicePipelineService],
})
export class VoicePipelineModule {}
