import type { BirthInput } from './types.ts';

export const DEFAULT_TIMEZONE = 'Asia/Seoul';
const DEFAULT_LONGITUDE = 127.0992;

const LOCAL_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const OFFSET_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function getLocalFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = LOCAL_FORMATTERS.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    LOCAL_FORMATTERS.set(timezone, formatter);
  }
  return formatter;
}

function getOffsetFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = OFFSET_FORMATTERS.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    OFFSET_FORMATTERS.set(timezone, formatter);
  }
  return formatter;
}

function getLocalDateTimeParts(date: Date, timezone: string): LocalDateTimeParts {
  const parts = getLocalFormatter(timezone)
    .formatToParts(date)
    .filter(part => part.type !== 'literal');

  const result: Partial<Record<keyof LocalDateTimeParts, number>> = {};
  for (const part of parts) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day'
      || part.type === 'hour' || part.type === 'minute'
    ) {
      result[part.type] = Number(part.value);
    }
  }

  return {
    year: result.year ?? 0,
    month: result.month ?? 0,
    day: result.day ?? 0,
    hour: result.hour ?? 0,
    minute: result.minute ?? 0,
  };
}

function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  const tzName = getOffsetFormatter(timezone)
    .formatToParts(date)
    .find(part => part.type === 'timeZoneName')
    ?.value;

  const match = tzName?.match(/^GMT(?:(\+|-)(\d{1,2})(?::(\d{2}))?)?$/);
  if (!match) throw new RangeError(`Unsupported time zone: ${timezone}`);

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

function sameLocalDateTime(a: LocalDateTimeParts, b: LocalDateTimeParts): boolean {
  return a.year === b.year
    && a.month === b.month
    && a.day === b.day
    && a.hour === b.hour
    && a.minute === b.minute;
}

function resolveLocalDateTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, timezone: string,
): Date {
  const local = { year, month, day, hour, minute };
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  let guessUtcMs = naiveUtcMs;

  for (let i = 0; i < 6; i++) {
    const offsetMinutes = getTimezoneOffsetMinutes(new Date(guessUtcMs), timezone);
    const nextUtcMs = naiveUtcMs - offsetMinutes * 60_000;
    if (nextUtcMs === guessUtcMs) break;
    guessUtcMs = nextUtcMs;
  }

  const utcDate = new Date(guessUtcMs);
  if (!sameLocalDateTime(getLocalDateTimeParts(utcDate, timezone), local)) {
    throw new RangeError(`Invalid local time for timezone ${timezone}: ${year}-${month}-${day} ${hour}:${minute}`);
  }

  return utcDate;
}

export function getBirthTimezone(input: BirthInput): string {
  return input.timezone ?? DEFAULT_TIMEZONE;
}

export function birthInputToUtcDate(
  year: number, month: number, day: number,
  hour: number, minute: number, timezone: string,
): Date {
  return resolveLocalDateTimeToUtc(year, month, day, hour, minute, timezone);
}

function getDayOfYear(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 0);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - start) / 86_400_000);
}

function getEquationOfTimeMinutes(year: number, month: number, day: number): number {
  const dayOfYear = getDayOfYear(year, month, day);
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

export function adjustBirthInputToSolarTime(input: BirthInput): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const timezone = getBirthTimezone(input);
  const utcDate = resolveLocalDateTimeToUtc(
    input.year, input.month, input.day, input.hour, input.minute, timezone,
  );
  const equationOfTime = getEquationOfTimeMinutes(input.year, input.month, input.day);
  const longitude = input.longitude ?? DEFAULT_LONGITUDE;
  const solarDate = new Date(utcDate.getTime() + (longitude * 4 + equationOfTime) * 60_000);

  return {
    year: solarDate.getUTCFullYear(),
    month: solarDate.getUTCMonth() + 1,
    day: solarDate.getUTCDate(),
    hour: solarDate.getUTCHours(),
    minute: solarDate.getUTCMinutes(),
  };
}
