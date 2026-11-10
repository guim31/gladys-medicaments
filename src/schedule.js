// -----------------------------------------------------------------------------
// Intake times in the local time of Gladys (the supervisor injects TZ).
//
// An intake is a "slot": its local minute, `YYYY-MM-DDTHH:MM`. Nothing is
// ever converted between time zones: the local "now" is computed with Intl,
// and slots compare with it as strings. Across a daylight saving change, a
// slot that does not exist (02:30 on the spring-forward night) is simply due
// at the first local minute after it (03:00), and a slot that exists twice
// (autumn) is notified once, the first time, since its state is recorded.
// -----------------------------------------------------------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLOT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (value) => String(value).padStart(2, '0');

/**
 * The local date, minute and ISO weekday (1 = Monday) at `now` in `timeZone`.
 * @param {number} now milliseconds since the epoch
 * @param {string} [timeZone] IANA name, the system zone when omitted
 */
// One formatter per time zone: building one is far slower than using it.
const formatters = new Map();
const formatter = (timeZone) => {
  const key = timeZone ?? '';
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return formatters.get(key);
};

export function localNow(now, timeZone) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minute: `${date}T${parts.hour}:${parts.minute}`, at: now };
}

const wallOf = (slot) => {
  const [, year, month, day, hour, minute] = slot.match(SLOT).map(Number);
  return Date.UTC(year, month - 1, day, hour, minute);
};

/**
 * The instant of a slot, in milliseconds: its first occurrence when the
 * autumn change makes it happen twice; when the spring change skips it, the
 * instant it would have had with the offset of the day before (one hour
 * after the change), so its grace delay never starts before it is due.
 */
export function instantOf(slot, timeZone) {
  const wall = wallOf(slot);
  const offsetAt = (at) => wallOf(localNow(at, timeZone).minute) - Math.floor(at / 60_000) * 60_000;
  const before = wall - offsetAt(wall - 86_400_000);
  const after = wall - offsetAt(wall + 86_400_000);
  for (const candidate of [before, after]) {
    if (localNow(candidate, timeZone).minute === slot) {
      return candidate;
    }
  }
  return before;
}

const utcOfDate = (date) => {
  const [, year, month, day] = date.match(DATE).map(Number);
  return Date.UTC(year, month - 1, day);
};

const dateOfUtc = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** `YYYY-MM-DD` plus `days` days. */
export const addDays = (date, days) => dateOfUtc(utcOfDate(date) + days * 86_400_000);

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
export const daysBetween = (from, to) => Math.round((utcOfDate(to) - utcOfDate(from)) / 86_400_000);

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function weekday(date) {
  const day = new Date(utcOfDate(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** A local minute plus `minutes` minutes, on the wall clock. */
export function addMinutes(slot, minutes) {
  const [, year, month, day, hour, minute] = slot.match(SLOT).map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute) + minutes * 60_000);
  return `${dateOfUtc(d.getTime())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Wall-clock minutes from slot `a` to slot `b`. */
export const minutesBetween = (a, b) => Math.round((wallOf(b) - wallOf(a)) / 60_000);

export const isDate = (value) => typeof value === 'string' && DATE.test(value);
export const isSlot = (value) => typeof value === 'string' && SLOT.test(value);
export const isTime = (value) =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/**
 * Parse the intake times typed in the configuration: `08:00, 20:00`,
 * `8h`, `8h30`, `20.15`, separated by commas, semicolons or spaces.
 * @returns {string[]} sorted `HH:MM`, without duplicates
 * @throws {RangeError} when a time is not understood
 */
export function parseTimes(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') {
    return [];
  }
  const times = text
    .split(/[\s,;/]+/)
    .filter(Boolean)
    .map((token) => {
      const match = token.match(/^(\d{1,2})(?:[:hH.](\d{2})?)?$/);
      if (!match || Number(match[1]) > 23 || Number(match[2] ?? 0) > 59) {
        throw new RangeError(token);
      }
      return `${pad(match[1])}:${pad(match[2] ?? 0)}`;
    });
  return [...new Set(times)].sort();
}

// Day names in the four languages, accents removed: German two-letter
// abbreviations, and the first three letters of every other name.
const SHORT_DAYS = { mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 7 };
const DAY_PREFIXES = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
  lun: 1,
  mar: 2,
  mer: 3,
  jeu: 4,
  ven: 5,
  sam: 6,
  dim: 7,
  mie: 3,
  jue: 4,
  vie: 5,
  sab: 6,
  dom: 7,
  die: 2,
  mit: 3,
  don: 4,
  fre: 5,
  son: 7,
};

function dayOf(token) {
  if (/^[1-7]$/.test(token)) {
    return Number(token);
  }
  return SHORT_DAYS[token] ?? (token.length >= 3 ? DAY_PREFIXES[token.slice(0, 3)] : undefined);
}

/**
 * Parse the days of the week: `mon, wed, fri`, `lun-ven`, `Mo-Fr`, `1,3,5`
 * (1 = Monday). Empty: every day.
 * @returns {number[]} sorted ISO weekdays
 * @throws {RangeError} when a day is not understood
 */
export function parseDays(raw) {
  const text = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\./g, '')
    .trim();
  if (text === '' || ['*', 'all', 'tous', 'alle', 'todos'].includes(text)) {
    return [1, 2, 3, 4, 5, 6, 7];
  }
  const days = new Set();
  for (const part of text.split(/[\s,;/]+/).filter(Boolean)) {
    const range = part.split(/[-–]/);
    if (range.length > 2) {
      throw new RangeError(part);
    }
    const [from, to] = range.map(dayOf);
    if (!from || (range.length === 2 && !to)) {
      throw new RangeError(part);
    }
    if (range.length === 1) {
      days.add(from);
      continue;
    }
    // A range may wrap around the week end (sat-mon).
    for (let day = from, i = 0; i < 7; day = (day % 7) + 1, i += 1) {
      days.add(day);
      if (day === to) {
        break;
      }
    }
  }
  return [...days].sort((a, b) => a - b);
}

/**
 * Parse a date: `2026-12-31`, `31/12/2026`, `31.12.2026`, or `+N` (N days
 * from today). Empty: null.
 * @throws {RangeError} when the text is not understood
 */
export function parseDate(raw, today) {
  const text = String(raw ?? '').trim();
  if (text === '') {
    return null;
  }
  const relative = text.match(/^\+\s*(\d{1,4})$/);
  if (relative) {
    return addDays(today, Number(relative[1]));
  }
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const european = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  const [year, month, day] = iso
    ? [iso[1], iso[2], iso[3]].map(Number)
    : european
      ? [european[3], european[2], european[1]].map(Number)
      : [];
  if (!year || year < 2000 || year > 2999) {
    throw new RangeError(text);
  }
  const date = `${year}-${pad(month)}-${pad(day)}`;
  if (dateOfUtc(Date.UTC(year, month - 1, day)) !== date) {
    throw new RangeError(text);
  }
  return date;
}

/** Whether a treatment has intakes on a local date (ignoring `since`). */
export function scheduledOn(treatment, date) {
  if (date < treatment.start || (treatment.end && date > treatment.end)) {
    return false;
  }
  if (treatment.every > 1) {
    return daysBetween(treatment.start, date) % treatment.every === 0;
  }
  return treatment.days.includes(weekday(date));
}

/**
 * The slots of a treatment on a local date. Slots before `since` (the
 * creation or the last schedule change) are left out: a new schedule never
 * makes the earlier hours of the day "missed". The intakes taken that day
 * always count, even when the schedule changed since.
 */
export function slotsOn(treatment, date) {
  const slots = new Set(
    Object.keys(treatment.slots).filter(
      (slot) => slot.startsWith(date) && treatment.slots[slot].taken_at,
    ),
  );
  if (scheduledOn(treatment, date)) {
    for (const time of treatment.times) {
      const slot = `${date}T${time}`;
      if (slot >= treatment.since) {
        slots.add(slot);
      }
    }
  }
  return [...slots].sort();
}

/** Slots from `from` to `to` included (local minutes), in order. */
export function slotsBetween(treatment, from, to) {
  const slots = [];
  for (let date = from.slice(0, 10); date <= to.slice(0, 10); date = addDays(date, 1)) {
    for (const slot of slotsOn(treatment, date)) {
      if (slot >= from && slot <= to) {
        slots.push(slot);
      }
    }
  }
  return slots;
}

// Intakes are looked for this far ahead (an "every 365 days" treatment).
const LOOK_AHEAD_DAYS = 370;

/** The first slot at or after `minute` not taken yet, null when there is none. */
export function nextSlot(treatment, minute) {
  const today = minute.slice(0, 10);
  for (let i = 0; i <= LOOK_AHEAD_DAYS; i += 1) {
    const date = addDays(today, i);
    if (treatment.end && date > treatment.end) {
      return null;
    }
    const slot = slotsOn(treatment, date).find(
      (candidate) => candidate >= minute && !treatment.slots[candidate]?.taken_at,
    );
    if (slot) {
      return slot;
    }
  }
  return null;
}
