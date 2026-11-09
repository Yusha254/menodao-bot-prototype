import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { VoicePipelineModule } from '../voice-pipeline/voice-pipeline.module';
import { AssemblyAiModule } from '../assemblyai/assemblyai.module';
import { SimulatorController } from './simulator.controller';

@Module({
  imports: [PrismaModule, VoicePipelineModule, AssemblyAiModule],
  controllers: [SimulatorController],
})
export class SimulatorModule {}
