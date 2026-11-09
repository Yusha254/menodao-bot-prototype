import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VoicePipelineService } from '../voice-pipeline/voice-pipeline.service';
import { WhatsappApiClient } from './whatsapp-api.client';
import { WHATSAPP_CLIENT } from './interfaces/whatsapp-provider.interface';
import { WhatsappIdentityService } from './whatsapp-identity.service';
import { WhatsappService } from './whatsapp.service';

describe('Waboxapp webhook handling', () => {
  const prisma = {
    user: {
      findUnique: jest
        .fn<
          (...args: unknown[]) => Promise<null | {
            id: string;
            phone?: string | null;
            whatsappId?: string;
          }>
        >()
        .mockResolvedValue(null),
      create: jest
        .fn<
          (...args: unknown[]) => Promise<{
            id: string;
            phone?: string | null;
            whatsappId?: string;
          }>
        >()
        .mockResolvedValue({ id: 'patient-1' }),
      update: jest
        .fn<
          (...args: unknown[]) => Promise<{
            id: string;
            phone?: string | null;
            whatsappId?: string;
          }>
        >()
        .mockResolvedValue({ id: 'patient-1' }),
    },
    messageLog: {
      create: jest
        .fn<(...args: unknown[]) => Promise<Record<string, never>>>()
        .mockResolvedValue({}),
      findMany: jest
        .fn<
          (...args: unknown[]) => Promise<{ role: string; content: string }[]>
        >()
        .mockResolvedValue([]),
    },
    lead: {
      findFirst: jest
        .fn<(...args: unknown[]) => Promise<null>>()
        .mockResolvedValue(null),
    },
  };
  const voicePipelineService = {
    processTextPipeline: jest
      .fn<(...args: unknown[]) => Promise<{ patientMessage: string }>>()
      .mockResolvedValue({ patientMessage: 'Hello back' }),
  };
  const whatsappClient = {
    markMessageAsRead: jest
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined),
    sendTextMessage: jest
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined),
    isRecentlySentTextMessage: jest
      .fn<(...args: unknown[]) => boolean>()
      .mockReturnValue(false),
    downloadMedia: jest
      .fn<(...args: unknown[]) => Promise<Buffer>>()
      .mockResolvedValue(Buffer.from('')),
  };
  const whatsappIdentityService = {
    verifyLinkCode: jest
      .fn<(...args: unknown[]) => Promise<{ phone: string } | null>>()
      .mockResolvedValue(null),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    whatsappClient.isRecentlySentTextMessage.mockReturnValue(false);
    whatsappIdentityService.verifyLinkCode.mockResolvedValue(null);
    voicePipelineService.processTextPipeline.mockResolvedValue({
      patientMessage: 'Hello back',
    });
  });

  async function createService(): Promise<WhatsappService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: new ConfigService({ WABOXAPP_API_TOKEN: 'test-token' }),
        },
        { provide: VoicePipelineService, useValue: voicePipelineService },
        { provide: WHATSAPP_CLIENT, useValue: whatsappClient },
        { provide: WhatsappApiClient, useValue: {} },
        { provide: WhatsappIdentityService, useValue: whatsappIdentityService },
      ],
    }).compile();

    return moduleRef.get(WhatsappService);
  }

  it('authenticates and replies to Waboxapp text webhooks', async () => {
    const service = await createService();

    await service.processWebhookPayload({
      event: 'message',
      token: 'test-token',
      uid: '254700000001',
      contact: { uid: '+254 700 000 002' },
      message: { uid: 'message-1', body: { type: 'chat', text: 'Hi' } },
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          whatsappId: '254700000002',
          phone: '254700000002',
        }),
      }),
    );
    expect(whatsappClient.sendTextMessage).toHaveBeenCalledWith(
      '254700000002',
      'Hello back',
    );
    expect(voicePipelineService.processTextPipeline).toHaveBeenCalledWith(
      'Hi',
      '254700000002',
      undefined,
      undefined,
      '254700000002',
    );
  });

  it('ignores webhooks with a mismatched API token', async () => {
    const service = await createService();

    await service.processWebhookPayload({
      event: 'message',
      token: 'incorrect-token',
      contact: { uid: '254700000002' },
      message: { body: { type: 'chat', text: 'Hi' } },
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(whatsappClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it('does not reply to a Waboxapp echo of a recent outbound message', async () => {
    whatsappClient.isRecentlySentTextMessage.mockReturnValue(true);
    const service = await createService();

    await service.processWebhookPayload({
      event: 'message',
      token: 'test-token',
      contact: { uid: '254700000002' },
      message: { body: { type: 'chat', text: 'Hello back' } },
    });

    expect(whatsappClient.isRecentlySentTextMessage).toHaveBeenCalledWith(
      '254700000002',
      'Hello back',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(whatsappClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it('does not process a repeated webhook when Waboxapp omits the message ID', async () => {
    const service = await createService();
    const payload = {
      event: 'message',
      token: 'test-token',
      contact: { uid: '254700000002' },
      message: { body: { type: 'chat', text: 'Repeated inbound message' } },
    };

    await service.processWebhookPayload(payload);
    await service.processWebhookPayload(payload);

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(whatsappClient.sendTextMessage).toHaveBeenCalledTimes(1);
  });

  it('accepts Waboxapp ACK event fields from the documented m object', async () => {
    const service = await createService();
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await service.processWebhookPayload({
      event: 'ack',
      m: { uid: 'wabox-message-id', ack: 2, custom_uid: 'outbound-id' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      'Waboxapp acknowledgment: status=delivered to recipient, ack=2, ' +
        'messageId=wabox-message-id, customUid=outbound-id.',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('links an inbound FlareSend LID and sends a fixed confirmation for a valid OTP', async () => {
    whatsappIdentityService.verifyLinkCode.mockResolvedValue({
      phone: '276497193509',
    });
    const service = await createService();
    const lid = '276497193509049@lid';
    const otp = '123456';

    await service.processWebhookPayload({
      event: 'message_received',
      data: {
        from: lid,
        id: 'message-2',
        message: { extendedTextMessage: { text: otp } },
      },
    });

    expect(whatsappIdentityService.verifyLinkCode).toHaveBeenCalledWith(
      lid,
      otp,
    );
    expect(whatsappClient.sendTextMessage).toHaveBeenCalledWith(
      '276497193509',
      expect.stringContaining('Your phone number is verified and linked'),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('does not send an invalid six-digit code to the LLM', async () => {
    const service = await createService();

    await service.processWebhookPayload({
      event: 'message_received',
      data: {
        from: '276497193509049@lid',
        id: 'message-invalid-otp',
        message: { extendedTextMessage: { text: '123456' } },
      },
    });

    expect(whatsappIdentityService.verifyLinkCode).toHaveBeenCalledWith(
      '276497193509049@lid',
      '123456',
    );
    expect(voicePipelineService.processTextPipeline).not.toHaveBeenCalled();
    expect(whatsappClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it('does not reply to an unlinked FlareSend LID', async () => {
    const service = await createService();

    await service.processWebhookPayload({
      event: 'message_received',
      data: {
        from: '276497193509049@lid',
        id: 'message-3',
        message: { extendedTextMessage: { text: 'Hello' } },
      },
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(whatsappClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it('routes linked FlareSend LID messages through the booking pipeline using the stored phone', async () => {
    const lid = '276497193509049@lid';
    const phone = '276497193509';
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'patient-1',
      whatsappId: lid,
      phone,
    });
    prisma.user.update.mockResolvedValue({
      id: 'patient-1',
      whatsappId: lid,
      phone,
    });
    const service = await createService();

    await service.processWebhookPayload({
      event: 'message_received',
      data: {
        from: lid,
        id: 'message-linked',
        message: { extendedTextMessage: { text: 'I want to book tomorrow' } },
      },
    });

    expect(voicePipelineService.processTextPipeline).toHaveBeenCalledWith(
      'I want to book tomorrow',
      phone,
      undefined,
      undefined,
      lid,
    );
    expect(whatsappClient.sendTextMessage).toHaveBeenCalledWith(
      phone,
      'Hello back',
    );
  });
});
