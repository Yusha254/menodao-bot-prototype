import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { AiModule } from './modules/ai/ai.module';
import { AdminModule } from './modules/admin/admin.module';
import { AssemblyAiModule } from './modules/assemblyai/assemblyai.module';
import { VoicePipelineModule } from './modules/voice-pipeline/voice-pipeline.module';
import { SimulatorModule } from './modules/simulator/simulator.module';
import { BookingModule } from './modules/booking/booking.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AiModule,
    WhatsappModule,
    WebhookModule,
    AdminModule,
    AssemblyAiModule,
    VoicePipelineModule,
    SimulatorModule,
    BookingModule,
  ],
})
export class AppModule {}
