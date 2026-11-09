import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WHATSAPP_CLIENT } from './interfaces/whatsapp-provider.interface';
import { WhatsappIdentityService } from './whatsapp-identity.service';

describe('WhatsappIdentityService', () => {
  const challenge = {
    findFirst: jest
      .fn<(...args: unknown[]) => Promise<{ id: string } | null>>()
      .mockResolvedValue(null),
    count: jest
      .fn<(...args: unknown[]) => Promise<number>>()
      .mockResolvedValue(0),
    deleteMany: jest
      .fn<(...args: unknown[]) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 0 }),
    updateMany: jest
      .fn<(...args: unknown[]) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 0 }),
    create: jest
      .fn<
        (args: {
          data: {
            id: string;
            phone: string;
            codeHash: string;
            expiresAt: Date;
            consentedAt: Date;
          };
        }) => Promise<Record<string, never>>
      >()
      .mockResolvedValue({}),
    update: jest
      .fn<(...args: unknown[]) => Promise<Record<string, never>>>()
      .mockResolvedValue({}),
    findUnique: jest
      .fn<(...args: unknown[]) => Promise<Record<string, unknown> | null>>()
      .mockResolvedValue(null),
    findMany: jest
      .fn<(...args: unknown[]) => Promise<Record<string, unknown>[]>>()
      .mockResolvedValue([]),
  };
  const transaction = {
    phoneRegistrationChallenge: {
      findUnique: jest
        .fn<(...args: unknown[]) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(null),
      update: jest
        .fn<(...args: unknown[]) => Promise<Record<string, never>>>()
        .mockResolvedValue({}),
      updateMany: jest
        .fn<(...args: unknown[]) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest
        .fn<(...args: unknown[]) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(null),
      create: jest
        .fn<(...args: unknown[]) => Promise<{ id: string }>>()
        .mockResolvedValue({ id: 'user-1' }),
      update: jest
        .fn<(...args: unknown[]) => Promise<{ id: string }>>()
        .mockResolvedValue({ id: 'user-1' }),
    },
  };
  const prisma = {
    phoneRegistrationChallenge: challenge,
    $transaction: jest.fn(
      async (
        callback: (tx: typeof transaction) => Promise<unknown>,
      ): Promise<unknown> => callback(transaction),
    ),
  };
  const whatsappClient = {
    sendTextMessage: jest
      .fn<(to: string, body: string) => Promise<void>>()
      .mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    challenge.findFirst.mockResolvedValue(null);
    challenge.count.mockResolvedValue(0);
    challenge.findUnique.mockResolvedValue(null);
    challenge.findMany.mockResolvedValue([]);
    transaction.phoneRegistrationChallenge.findUnique.mockResolvedValue(null);
    transaction.phoneRegistrationChallenge.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.user.findUnique.mockResolvedValue(null);
  });

  async function createService(): Promise<WhatsappIdentityService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappIdentityService,
        { provide: PrismaService, useValue: prisma },
        { provide: WHATSAPP_CLIENT, useValue: whatsappClient },
      ],
    }).compile();
    return moduleRef.get(WhatsappIdentityService);
  }

  it('sends a one-time linking code to the normalized phone number', async () => {
    const service = await createService();

    await service.startPhoneLinking('+254 712 345 678');

    expect(whatsappClient.sendTextMessage).toHaveBeenCalledWith(
      '254712345678',
      expect.stringMatching(/(?:^|\n\n)\d{6}(?:\n\n|$)/),
    );
    expect(challenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '254712345678',
          codeHash: expect.any(String),
        }),
      }),
    );
    const sentMessage = whatsappClient.sendTextMessage.mock.calls[0][1];
    const match = /\n\n(\d{6})\n\n/.exec(sentMessage);
    expect(match).not.toBeNull();
    const code = match?.[1] ?? '';
    const storedChallenge = challenge.create.mock.calls[0][0].data;
    const storedHash = storedChallenge.codeHash;
    expect(storedHash).toBe(
      createHash('sha256')
        .update(`${storedChallenge.id}:${code}`)
        .digest('hex'),
    );
  });

  it('links the LID that sends the valid six-digit code to its phone', async () => {
    const service = await createService();
    const code = '123456';
    const consentedAt = new Date();
    const codeHash = createHash('sha256')
      .update(`challenge-1:${code}`)
      .digest('hex');
    challenge.findMany.mockResolvedValue([
      {
        id: 'challenge-1',
        phone: '254712345678',
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
        consentedAt,
      },
    ]);
    transaction.phoneRegistrationChallenge.findUnique.mockResolvedValue({
      id: 'challenge-1',
      phone: '254712345678',
      codeHash,
      expiresAt: new Date(Date.now() + 60_000),
      consentedAt,
      linkedAt: null,
      linkedWhatsappId: null,
    });

    await expect(service.verifyLinkCode('12345@lid', code)).resolves.toEqual({
      phone: '254712345678',
    });

    expect(transaction.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        whatsappId: '12345@lid',
        phone: '254712345678',
        phoneConsentAt: consentedAt,
      }),
    });
    expect(
      transaction.phoneRegistrationChallenge.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'challenge-1', linkedAt: null }),
        data: expect.objectContaining({
          linkedAt: expect.any(Date),
          linkedWhatsappId: '12345@lid',
        }),
      }),
    );
  });

  it('rejects expired linking codes', async () => {
    const service = await createService();
    challenge.findMany.mockResolvedValue([]);
    await expect(
      service.verifyLinkCode('12345@lid', '123456'),
    ).resolves.toBeNull();
    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it('allows the linked sender to retry a code if the confirmation was not delivered', async () => {
    const service = await createService();
    const code = '123456';
    const codeHash = createHash('sha256')
      .update(`challenge-1:${code}`)
      .digest('hex');
    challenge.findMany.mockResolvedValue([
      {
        id: 'challenge-1',
        phone: '254712345678',
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
        consentedAt: new Date(),
      },
    ]);
    transaction.phoneRegistrationChallenge.findUnique.mockResolvedValue({
      id: 'challenge-1',
      phone: '254712345678',
      codeHash,
      expiresAt: new Date(Date.now() + 60_000),
      linkedAt: new Date(),
      linkedWhatsappId: '12345@lid',
    });

    await expect(service.verifyLinkCode('12345@lid', code)).resolves.toEqual({
      phone: '254712345678',
    });
    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it('updates an existing phone-keyed user to the newly observed LID', async () => {
    const service = await createService();
    const code = '123456';
    const codeHash = createHash('sha256')
      .update(`challenge-1:${code}`)
      .digest('hex');
    challenge.findMany.mockResolvedValue([
      {
        id: 'challenge-1',
        phone: '254712345678',
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
        consentedAt: new Date(),
      },
    ]);
    transaction.phoneRegistrationChallenge.findUnique.mockResolvedValue({
      id: 'challenge-1',
      phone: '254712345678',
      expiresAt: new Date(Date.now() + 60_000),
      linkedAt: null,
    });
    transaction.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'legacy-user', phone: null })
      .mockResolvedValueOnce({ id: 'legacy-user' });

    await expect(service.verifyLinkCode('12345@lid', code)).resolves.toEqual({
      phone: '254712345678',
    });

    expect(transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'legacy-user' },
        data: expect.objectContaining({
          whatsappId: '12345@lid',
          phone: '254712345678',
        }),
      }),
    );
    expect(transaction.user.create).not.toHaveBeenCalled();
  });
});
