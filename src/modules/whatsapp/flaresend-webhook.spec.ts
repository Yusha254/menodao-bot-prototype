import { ConfigService } from '@nestjs/config';
import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VoicePipelineService } from '../voice-pipeline/voice-pipeline.service';
import { FlaresendApiClient } from './flaresend-api.client';
import { IWhatsappClient } from './interfaces/whatsapp-provider.interface';
import { WhatsappApiClient } from './whatsapp-api.client';
import { WhatsappIdentityService } from './whatsapp-identity.service';
import { WhatsappService } from './whatsapp.service';

describe('Flaresend voice-note webhook', () => {
  it('transcribes linked voice notes and replies with the pipeline response', async () => {
    const audio = Buffer.from('OggS audio');
    const sendTextMessage = jest.fn<IWhatsappClient['sendTextMessage']>();
    const downloadAudio = jest
      .fn<FlaresendApiClient['downloadAudio']>()
      .mockResolvedValue(audio);
    const processVoicePipeline = jest
      .fn<VoicePipelineService['processVoicePipeline']>()
      .mockResolvedValue({
        intakeUuid: 'session-1',
        senderPhone: '254712345678',
        transcript: 'I have a toothache',
        intent: 'HEALTH_EDUCATION',
        intentConfidence: 0.9,
        patientMessage: 'Please contact a dentist.',
        status: 'completed',
      });
    const prisma = {
      user: {
        findUnique: jest
          .fn<() => Promise<{ phone: string } | null>>()
          .mockResolvedValue({ phone: '254712345678' }),
      },
    } as unknown as PrismaService;
    const whatsappClient = {
      sendTextMessage,
      markMessageAsRead: jest.fn(),
    } as unknown as IWhatsappClient;
    const service = new WhatsappService(
      prisma,
      new ConfigService(),
      { processVoicePipeline } as unknown as VoicePipelineService,
      whatsappClient,
      { downloadAudio } as unknown as FlaresendApiClient,
      {} as WhatsappApiClient,
      {} as WhatsappIdentityService,
    );

    await service.processWebhookPayload({
      event: 'message_received',
      data: {
        from: '12345@lid',
        id: 'message-1',
        timestamp: 1,
        message: {
          audioMessage: {
            url: 'https://mmg.whatsapp.net/v/audio.enc',
            mediaKey: 'media-key',
            mimetype: 'audio/ogg; codecs=opus',
          },
        },
      },
    });

    expect(downloadAudio).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'audio/ogg; codecs=opus' }),
    );
    expect(processVoicePipeline).toHaveBeenCalledWith(
      audio,
      '254712345678',
      undefined,
      '12345@lid',
    );
    expect(sendTextMessage).toHaveBeenCalledWith(
      '254712345678',
      'Please contact a dentist.',
    );
  });
});
