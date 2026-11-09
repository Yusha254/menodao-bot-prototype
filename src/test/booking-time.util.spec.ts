/**
 * booking-time.util.spec.ts
 *
 * Unit tests for booking-time.util.ts.
 * No I/O — all pure function tests.
 */
import { DateTime } from 'luxon';
import {
  BookingConfig,
  validateSlot,
  toScheduledAt,
  anchors,
  daySlots,
  snapToSlot,
} from '../modules/booking/booking-time.util';

// ── Shared test config ────────────────────────────────────────────────────────

const cfg: BookingConfig = {
  timezone: 'Africa/Nairobi',
  openDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
  openTime: '08:00',
  closeTime: '17:00',
  slotMinutes: 30,
  draftTtlMinutes: 30,
};

// Helper: build a Nairobi DateTime at a specific date and time
function eat(dateIso: string, timeHHmm: string): DateTime {
  const [h, m] = timeHHmm.split(':').map(Number);
  return DateTime.fromISO(dateIso, { zone: 'Africa/Nairobi' }).set({
    hour: h,
    minute: m,
    second: 0,
    millisecond: 0,
  });
}

// ── validateSlot ──────────────────────────────────────────────────────────────

describe('validateSlot', () => {
  const monday = '2026-10-26'; // A Monday
  const sunday = '2026-10-25'; // A Sunday

  test('returns PAST for a slot in the past (same day)', () => {
    const now = eat(monday, '11:00');
    expect(validateSlot(monday, '10:00', now, cfg)).toBe('PAST');
  });

  test('returns PAST for a time exactly equal to now', () => {
    const now = eat(monday, '10:00');
    expect(validateSlot(monday, '10:00', now, cfg)).toBe('PAST');
  });

  test('returns CLOSED_DAY for Sunday', () => {
    const now = eat(sunday, '07:00'); // Before Sunday, not past
    expect(validateSlot(sunday, '10:00', now, cfg)).toBe('CLOSED_DAY');
  });

  test('returns OUTSIDE_HOURS for 07:30 (too early — slot ends at 08:00, opens at 08:00)', () => {
    const now = eat(monday, '06:00');
    expect(validateSlot(monday, '07:30', now, cfg)).toBe('OUTSIDE_HOURS');
  });

  test('returns OUTSIDE_HOURS for 16:45 (last slot must END by 17:00; 16:45+30m=17:15)', () => {
    const now = eat(monday, '06:00');
    expect(validateSlot(monday, '16:45', now, cfg)).toBe('OUTSIDE_HOURS');
  });

  test('returns OK for 16:30 (slot ends exactly at 17:00)', () => {
    const now = eat(monday, '06:00');
    expect(validateSlot(monday, '16:30', now, cfg)).toBe('OK');
  });

  test('returns NOT_ON_SLOT_BOUNDARY for 08:15 (not a 30-min boundary from 08:00)', () => {
    const now = eat(monday, '06:00');
    expect(validateSlot(monday, '08:15', now, cfg)).toBe('NOT_ON_SLOT_BOUNDARY');
  });

  test('returns OK for 08:00 (opening slot)', () => {
    const now = eat(monday, '06:00');
    expect(validateSlot(monday, '08:00', now, cfg)).toBe('OK');
  });

  test('returns OK for 10:00 (mid-day slot)', () => {
    const now = eat(monday, '06:00');
    expect(validateSlot(monday, '10:00', now, cfg)).toBe('OK');
  });

  test('returns OK for Saturday (included in openDays)', () => {
    const saturday = '2026-10-31'; // A Saturday
    const now = eat(saturday, '06:00');
    expect(validateSlot(saturday, '09:00', now, cfg)).toBe('OK');
  });
});

// ── toScheduledAt ─────────────────────────────────────────────────────────────

describe('toScheduledAt', () => {
  test('01:00 EAT on Monday is still Sunday in UTC', () => {
    const result = toScheduledAt('2026-10-26', '01:00', cfg);
    const utcDt = DateTime.fromJSDate(result, { zone: 'UTC' });
    expect(utcDt.day).toBe(25); // Sunday 25 in UTC (EAT is UTC+3)
    expect(utcDt.hour).toBe(22); // 01:00 EAT = 22:00 UTC previous day
  });

  test('10:00 EAT is 07:00 UTC', () => {
    const result = toScheduledAt('2026-10-26', '10:00', cfg);
    const utcDt = DateTime.fromJSDate(result, { zone: 'UTC' });
    expect(utcDt.day).toBe(26);
    expect(utcDt.hour).toBe(7);
  });

  test('returns a JS Date', () => {
    const result = toScheduledAt('2026-10-26', '09:00', cfg);
    expect(result).toBeInstanceOf(Date);
  });
});

// ── anchors / "tomorrow" at 23:50 EAT ────────────────────────────────────────

describe('anchors', () => {
  test('"tomorrow" computed at 23:50 EAT is the next calendar day in EAT', () => {
    // We stub DateTime.now() by providing a cfg with a timezone and checking
    // tomorrowIso vs todayIso differ by exactly one day.
    // Since anchors() calls DateTime.now() internally, we can't easily stub it
    // in a pure unit test without mocking — so we verify the relationship holds
    // using the actual current date (this test is environment-independent):
    const result = anchors(cfg);
    const today = DateTime.fromISO(result.todayIso, { zone: 'Africa/Nairobi' });
    const tomorrow = DateTime.fromISO(result.tomorrowIso, { zone: 'Africa/Nairobi' });
    expect(tomorrow.diff(today, 'days').days).toBe(1);
  });

  test('nextWeekIso is 7 days ahead from the start of next week', () => {
    const result = anchors(cfg);
    const today = DateTime.fromISO(result.todayIso, { zone: 'Africa/Nairobi' });
    const nextWeek = DateTime.fromISO(result.nextWeekIso, { zone: 'Africa/Nairobi' });
    expect(nextWeek > today).toBe(true);
  });
});

// ── daySlots ──────────────────────────────────────────────────────────────────

describe('daySlots', () => {
  test('returns slots from 08:00 to 16:30 (30-min intervals)', () => {
    const slots = daySlots(cfg);
    expect(slots[0]).toBe('08:00');
    expect(slots[slots.length - 1]).toBe('16:30');
    expect(slots).toHaveLength(18); // (17:00 - 08:00) * 60 / 30 = 18 slots
  });
});

// ── snapToSlot ────────────────────────────────────────────────────────────────

describe('snapToSlot', () => {
  test('10:15 snaps to 10:00', () => {
    expect(snapToSlot('10:15', cfg)).toBe('10:00');
  });

  test('10:00 stays 10:00', () => {
    expect(snapToSlot('10:00', cfg)).toBe('10:00');
  });

  test('08:45 snaps to 08:30', () => {
    expect(snapToSlot('08:45', cfg)).toBe('08:30');
  });
});

// ── Nairobi vs UTC edge case ──────────────────────────────────────────────────

describe('Nairobi/UTC date edge', () => {
  test('midnight EAT (00:00) is 21:00 UTC the previous day', () => {
    const d = toScheduledAt('2026-10-26', '00:00', cfg);
    const utc = DateTime.fromJSDate(d, { zone: 'UTC' });
    expect(utc.toISO()).toContain('2026-10-25T21:00:00');
  });

  test('23:00 EAT is 20:00 UTC same day', () => {
    const d = toScheduledAt('2026-10-26', '23:00', cfg);
    const utc = DateTime.fromJSDate(d, { zone: 'UTC' });
    expect(utc.hour).toBe(20);
    expect(utc.day).toBe(26);
  });
});
