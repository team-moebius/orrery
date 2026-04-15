import tzLookup from '@photostructure/tz-lookup'

const LOCAL_FORMATTERS = new Map<string, Intl.DateTimeFormat>()
const OFFSET_FORMATTERS = new Map<string, Intl.DateTimeFormat>()

interface LocalDateTimeParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function getLocalFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = LOCAL_FORMATTERS.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    LOCAL_FORMATTERS.set(timezone, formatter)
  }
  return formatter
}

function getOffsetFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = OFFSET_FORMATTERS.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    OFFSET_FORMATTERS.set(timezone, formatter)
  }
  return formatter
}

function getLocalDateTimeParts(date: Date, timezone: string): LocalDateTimeParts {
  const parts = getLocalFormatter(timezone)
    .formatToParts(date)
    .filter(part => part.type !== 'literal')

  const result: Partial<Record<keyof LocalDateTimeParts, number>> = {}
  for (const part of parts) {
    if (
      part.type === 'year'
      || part.type === 'month'
      || part.type === 'day'
      || part.type === 'hour'
      || part.type === 'minute'
    ) {
      result[part.type] = Number(part.value)
    }
  }

  return {
    year: result.year ?? 0,
    month: result.month ?? 0,
    day: result.day ?? 0,
    hour: result.hour ?? 0,
    minute: result.minute ?? 0,
  }
}

function getTimeZoneOffsetMinutes(date: Date, timezone: string): number {
  const tzName = getOffsetFormatter(timezone)
    .formatToParts(date)
    .find(part => part.type === 'timeZoneName')
    ?.value

  const match = tzName?.match(/^GMT(?:(\+|-)(\d{1,2})(?::(\d{2}))?)?$/)
  if (!match) throw new RangeError(`Unsupported time zone: ${timezone}`)

  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  return sign * (hours * 60 + minutes)
}

function sameLocalDateTime(a: LocalDateTimeParts, b: LocalDateTimeParts): boolean {
  return a.year === b.year
    && a.month === b.month
    && a.day === b.day
    && a.hour === b.hour
    && a.minute === b.minute
}

function resolveLocalDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const local = { year, month, day, hour, minute }
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute)
  let guessUtcMs = naiveUtcMs

  for (let i = 0; i < 6; i++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(guessUtcMs), timezone)
    const nextUtcMs = naiveUtcMs - offsetMinutes * 60_000
    if (nextUtcMs === guessUtcMs) break
    guessUtcMs = nextUtcMs
  }

  const utcDate = new Date(guessUtcMs)
  if (!sameLocalDateTime(getLocalDateTimeParts(utcDate, timezone), local)) {
    throw new RangeError(`Invalid local time for timezone ${timezone}: ${year}-${month}-${day} ${hour}:${minute}`)
  }

  return utcDate
}

function formatUtcOffsetMinutes(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)
  const hours = Math.floor(absolute / 60)
  const minutes = absolute % 60

  if (minutes === 0) {
    return `UTC${sign}${hours}`
  }

  return `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`
}

export function inferTimeZoneFromCoordinates(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null

  try {
    return tzLookup(latitude, longitude)
  } catch {
    return null
  }
}

function getTimeZoneOffsetLabelAtLocalTime(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string | null {
  const value = timezone.trim()
  if (!value) return null

  try {
    const utcDate = resolveLocalDateTimeToUtc(year, month, day, hour, minute, value)
    const offsetMinutes = getTimeZoneOffsetMinutes(utcDate, value)
    return formatUtcOffsetMinutes(offsetMinutes)
  } catch {
    return null
  }
}

export function getTimeZoneDisplayLabelAtLocalTime(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string | null {
  const offsetLabel = getTimeZoneOffsetLabelAtLocalTime(timezone, year, month, day, hour, minute)
  if (!offsetLabel) return null
  return `${timezone.trim()} (${offsetLabel})`
}
