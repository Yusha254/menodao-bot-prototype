/**
 * booking-draft-machine.spec.ts
 *
 * Unit tests for the BookingDraft state machine in BookingService.
 * Uses a mocked LLM provider and mocked PrismaService to verify:
 *  1. Missing fields are asked for in order
 *  2. At most two missing fields asked per turn
 *  3. CONFIRM creates exactly one Appointment and deletes the draft
 *  4. Slot conflict returns alternatives and resets draft time
 *  5. Stale draft is dropped when older than TTL
 *  6. triageFlag returns emergency guidance and skips booking
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BookingService } from '../modules/booking/booking.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { LLM_PROVIDER } from '../modules/ai/interfaces/llm-provider.interface';
import { DateTime } from 'luxon';

describe('BookingDraft State Machine', () => {
  let service: BookingService;
  let mockPrisma: any;
  let mockLlmProvider: any;
  let mockConfigService: any;

  const sampleClinics = [
    {
      id: 'clinic-1',
      name: 'Mombasa Central Dental',
      services: ['Cleaning', 'Extraction', 'Filling'],
      phone: '+254700000001',
      isActive: true,
    },
    {
      id: 'clinic-2',
      name: 'Nyali Dental Clinic',
      services: ['Cleaning', 'Whitening'],
      phone: '+254700000002',
      isActive: true,
    },
  ];
  const futureOpenDate = DateTime.now()
    .setZone('Africa/Nairobi')
    .plus({ days: 1 })
    .toISODate()!;

  beforeEach(async () => {
    mockPrisma = {
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
      bookingDraft: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      clinic: {
        findMany: jest.fn().mockResolvedValue(sampleClinics),
      },
      messageLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      appointment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => {
        return cb(mockPrisma);
      }),
    };

    mockLlmProvider = {
      generateCompletion: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'BOOKING_TIMEZONE':
            return 'Africa/Nairobi';
          case 'BOOKING_OPEN_DAYS':
            return '1,2,3,4,5,6';
          case 'BOOKING_OPEN_TIME':
            return '08:00';
          case 'BOOKING_CLOSE_TIME':
            return '17:00';
          case 'BOOKING_SLOT_MINUTES':
            return '30';
          case 'BOOKING_DRAFT_TTL_MINUTES':
            return '30';
          default:
            return undefined;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LLM_PROVIDER, useValue: mockLlmProvider },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  // ── 1 & 2: Missing fields order & two-per-turn limit ───────────────────────

  test('asks for missing fields in order (service, clinic first) and limits to 2 per turn', async () => {
    const emptyDraft = {
      id: 'draft-1',
      userId: 'user-1',
      service: null,
      clinicId: null,
      date: null,
      time: null,
      clientName: null,
      language: 'en',
      status: 'COLLECTING',
      updatedAt: new Date(),
    };

    mockPrisma.bookingDraft.upsert.mockResolvedValue(emptyDraft);
    mockPrisma.bookingDraft.findUnique.mockResolvedValue(emptyDraft);
    mockPrisma.bookingDraft.update.mockResolvedValue(emptyDraft);

    // The patient provided a name, but the remaining booking fields are missing.
    mockLlmProvider.generateCompletion.mockResolvedValue(
      JSON.stringify({
        action: 'PROVIDE_DETAILS',
        clientName: 'Joshua Kyalo',
        service: null,
        clinicName: null,
        preferredDate: null,
        preferredTime: null,
        rawDateMentioned: null,
        language: 'en',
        triageFlag: false,
        confidence: 0.9,
      }),
    );

    const result = await service.handleDraftTurn('I want to book an appointment', '+254712345678', 'user-1');

    // Should ask for service (first) and clinic (second), but NOT datetime or name yet (limit 2)
    expect(result.reply).toContain('What dental service would you like?');
    expect(result.reply).toContain('Which clinic would you like to visit?');
    expect(result.reply).not.toContain('What date and time');
    expect(result.reply).not.toContain('What name should');
    expect(result.triageFlag).toBe(false);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Joshua Kyalo' },
    });
  });

  test('answers booking status questions deterministically without an LLM call', async () => {
    const readyDraft = {
      id: 'draft-1',
      userId: 'user-1',
      service: 'Routine checkup',
      clinicId: 'clinic-1',
      date: futureOpenDate,
      time: '08:00',
      clientName: 'Joshua Kyalo',
      rawDateMentioned: 'tomorrow',
      language: 'en',
      status: 'AWAITING_CONFIRMATION',
      updatedAt: new Date(),
    };
    mockPrisma.bookingDraft.upsert.mockResolvedValue(readyDraft);

    const result = await service.handleDraftTurn(
      'Is my booking confirmed?',
      '+254712345678',
      'user-1',
    );

    expect(result.reply).toContain('not confirmed yet');
    expect(result.reply).toContain('reply *Yes*');
    expect(mockLlmProvider.generateCompletion).not.toHaveBeenCalled();
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  // ── 3: CONFIRM creates exactly one Appointment ─────────────────────────────

  test('CONFIRM creates exactly one Appointment and deletes the draft', async () => {
    const readyDraft = {
      id: 'draft-1',
      userId: 'user-1',
      service: 'Cleaning',
      clinicId: 'clinic-1',
      date: futureOpenDate,
      time: '10:00',
      clientName: 'Jane Doe',
      rawDateMentioned: 'Tuesday 10am',
      language: 'en',
      status: 'AWAITING_CONFIRMATION',
      updatedAt: new Date(),
    };

    mockPrisma.bookingDraft.upsert.mockResolvedValue(readyDraft);
    mockPrisma.bookingDraft.findUnique.mockResolvedValue(readyDraft);

    mockLlmProvider.generateCompletion.mockResolvedValue(
      JSON.stringify({
        action: 'CONFIRM',
        clientName: null,
        service: null,
        clinicName: null,
        preferredDate: null,
        preferredTime: null,
        rawDateMentioned: null,
        language: 'en',
        triageFlag: false,
        confidence: 0.95,
      }),
    );

    const createdAppointment = {
      id: 'appt-12345678-abcd',
      userId: 'user-1',
      clientName: 'Jane Doe',
      phone: '+254712345678',
      clinicId: 'clinic-1',
      clinicName: 'Mombasa Central Dental',
      service: 'Cleaning',
      scheduledAt: new Date(),
      status: 'BOOKED',
    };

    mockPrisma.appointment.findFirst.mockResolvedValue(null);
    mockPrisma.appointment.create.mockResolvedValue(createdAppointment);
    mockPrisma.bookingDraft.delete.mockResolvedValue(readyDraft);

    const result = await service.handleDraftTurn('Yes, that is correct', '+254712345678', 'user-1');

    expect(mockPrisma.appointment.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.bookingDraft.delete).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(result.reply).toContain('Appointment Confirmed');
    expect(result.reply).toContain('APPT-123'); // first 8 chars uppercase
  });

  // ── 4: Slot conflict returns alternatives ───────────────────────────────────

  test('a slot conflict returns alternatives and resets draft time to null', async () => {
    const readyDraft = {
      id: 'draft-1',
      userId: 'user-1',
      service: 'Cleaning',
      clinicId: 'clinic-1',
      date: futureOpenDate,
      time: '10:00',
      clientName: 'Jane Doe',
      rawDateMentioned: 'Tuesday 10am',
      language: 'en',
      status: 'AWAITING_CONFIRMATION',
      updatedAt: new Date(),
    };

    mockPrisma.bookingDraft.upsert.mockResolvedValue(readyDraft);
    mockPrisma.bookingDraft.findUnique.mockResolvedValue(readyDraft);

    mockLlmProvider.generateCompletion.mockResolvedValue(
      JSON.stringify({
        action: 'CONFIRM',
        clientName: null,
        service: null,
        clinicName: null,
        preferredDate: null,
        preferredTime: null,
        rawDateMentioned: null,
        language: 'en',
        triageFlag: false,
        confidence: 0.95,
      }),
    );

    // Conflict exists in DB for this slot
    mockPrisma.appointment.findFirst.mockImplementation((args: any) => {
      // Conflict on the requested slot
      if (args.where.clinicId === 'clinic-1' && args.where.scheduledAt) {
        return Promise.resolve({ id: 'existing-conflict-appt' });
      }
      return Promise.resolve(null);
    });

    const result = await service.handleDraftTurn('Yes confirm', '+254712345678', 'user-1');

    // Should update draft to reset time and status to COLLECTING
    expect(mockPrisma.bookingDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        data: expect.objectContaining({ status: 'COLLECTING', time: null }),
      }),
    );
    expect(result.reply).toContain('That slot is already taken');
  });

  // ── 5: Stale draft is dropped ──────────────────────────────────────────────

  test('isDraftFresh returns false for drafts older than BOOKING_DRAFT_TTL_MINUTES', () => {
    const freshDraft: any = {
      updatedAt: DateTime.now().setZone('Africa/Nairobi').minus({ minutes: 10 }).toJSDate(),
    };
    expect(service.isDraftFresh(freshDraft)).toBe(true);

    const staleDraft: any = {
      updatedAt: DateTime.now().setZone('Africa/Nairobi').minus({ minutes: 35 }).toJSDate(),
    };
    expect(service.isDraftFresh(staleDraft)).toBe(false);
  });

  // ── 6: triageFlag skips booking ─────────────────────────────────────────────

  test('triageFlag returns emergency guidance and skips booking', async () => {
    const draft = {
      id: 'draft-1',
      userId: 'user-1',
      service: null,
      clinicId: null,
      date: null,
      time: null,
      clientName: null,
      language: 'en',
      status: 'COLLECTING',
      updatedAt: new Date(),
    };

    mockPrisma.bookingDraft.upsert.mockResolvedValue(draft);

    mockLlmProvider.generateCompletion.mockResolvedValue(
      JSON.stringify({
        action: 'PROVIDE_DETAILS',
        clientName: null,
        service: null,
        clinicName: null,
        preferredDate: null,
        preferredTime: null,
        rawDateMentioned: null,
        language: 'en',
        triageFlag: true,
        confidence: 0.99,
      }),
    );

    const result = await service.handleDraftTurn(
      'My face is severely swollen and I have trouble swallowing',
      '+254712345678',
      'user-1',
    );

    expect(result.triageFlag).toBe(true);
    expect(result.reply).toContain('dental emergency');
    expect(result.reply).toContain('+254700000001'); // Clinic phone injected
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
    // Draft should NOT be deleted
    expect(mockPrisma.bookingDraft.delete).not.toHaveBeenCalled();
  });
});
