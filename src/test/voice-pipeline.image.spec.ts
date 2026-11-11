import { ConfigService } from '@nestjs/config';
import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../common/prisma/prisma.service';
import { BookingService } from '../modules/booking/booking.service';
import { ILlmProvider } from '../modules/ai/interfaces/llm-provider.interface';
import { VoicePipelineService } from '../modules/voice-pipeline/voice-pipeline.service';
import { AssemblyAiService } from '../modules/assemblyai/assemblyai.service';
import { DR_PAPI_FALLBACK_REPLY } from '../prompts';

describe('VoicePipelineService image handling', () => {
  it('passes health-education images to the response model without persisting image bytes', async () => {
    const generateCompletion = jest
      .fn<ILlmProvider['generateCompletion']>()
      .mockResolvedValueOnce('{"intent":"HEALTH_EDUCATION","confidence":0.95}')
      .mockResolvedValueOnce(
        'I can describe visible features, but not diagnose.',
      );
    const messageLogCreate = jest.fn();
    const prisma = {
      user: {
        upsert: jest
          .fn<() => Promise<{ id: string }>>()
          .mockResolvedValue({ id: 'user-1' }),
      },
      bookingDraft: {
        findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      },
      messageLog: {
        create: messageLogCreate,
      },
    } as unknown as PrismaService;
    const image = {
      mimeType: 'image/jpeg',
      data: Buffer.from([0xff, 0xd8, 0xff]),
    };
    const service = new VoicePipelineService(
      prisma,
      new ConfigService(),
      {} as AssemblyAiService,
      { generateCompletion } as ILlmProvider,
      {} as BookingService,
    );

    const result = await service.processTextPipeline(
      'What is in this image?',
      '254712345678',
      undefined,
      undefined,
      '254712345678@s.whatsapp.net',
      image,
    );

    expect(result.patientMessage).toContain('describe visible features');
    expect(generateCompletion).toHaveBeenCalledTimes(2);
    expect(generateCompletion).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operation: 'voice_intent_classification' }),
    );
    expect(generateCompletion).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operation: 'voice_health_education',
        image,
      }),
    );
    expect(messageLogCreate).toHaveBeenCalledTimes(2);
    expect(messageLogCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.stringContaining('What is in this image?'),
        }),
      }),
    );
    expect(messageLogCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'I can describe visible features, but not diagnose.',
        }),
      }),
    );
  });

  it('sends and logs a user-facing fallback when the health model fails', async () => {
    const generateCompletion = jest
      .fn<ILlmProvider['generateCompletion']>()
      .mockResolvedValueOnce('{"intent":"HEALTH_EDUCATION","confidence":0.95}')
      .mockRejectedValueOnce(new Error('provider unavailable'));
    const messageLogCreate = jest.fn();
    const prisma = {
      user: {
        upsert: jest
          .fn<() => Promise<{ id: string }>>()
          .mockResolvedValue({ id: 'user-1' }),
      },
      bookingDraft: {
        findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      },
      messageLog: {
        create: messageLogCreate,
      },
    } as unknown as PrismaService;
    const service = new VoicePipelineService(
      prisma,
      new ConfigService(),
      {} as AssemblyAiService,
      { generateCompletion } as ILlmProvider,
      {} as BookingService,
    );

    const result = await service.processTextPipeline(
      'What should I do about a toothache?',
      '254712345678',
    );

    expect(result.patientMessage).toBe(DR_PAPI_FALLBACK_REPLY);
    expect(messageLogCreate).toHaveBeenLastCalledWith({
      data: {
        userId: 'user-1',
        role: 'assistant',
        content: DR_PAPI_FALLBACK_REPLY,
      },
    });
  });
});
