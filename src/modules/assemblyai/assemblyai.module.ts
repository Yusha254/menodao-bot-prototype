import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssemblyAiService } from './assemblyai.service';

@Module({
  imports: [ConfigModule],
  providers: [AssemblyAiService],
  exports: [AssemblyAiService],
})
export class AssemblyAiModule {}
