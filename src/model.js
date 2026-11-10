// -----------------------------------------------------------------------------
// The treatments document, as stored in /data/medications.json:
//
//   { schema: 1, treatments: [{
//       id, name, person, times: ['08:00', '20:00'],
//       days: [1..7] (ISO weekdays), every: 1 (every N days, from `start`),
//       start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | null,
//       since: 'YYYY-MM-DDTHH:MM' (creation or last schedule change),
//       grace: 30 (minutes before an intake counts as missed),
//       dose: 1, stock: number | null, stock_alert: number | null,
//       stock_low_notified: false, created_at,
//       slots: { 'YYYY-MM-DDTHH:MM': { taken_at?, due_sent?, missed_sent? } } }] }
//
// Ids are random, generated here, and become the device external ids: never
// derived from a name. `normalizeDocument` repairs what a hand edit or an
// older version may have left and keeps unknown fields. Slot records older
// than a week are dropped (`pruneSlots`).
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { addDays, isDate, isSlot, isTime } from './schedule.js';

export const SCHEMA_VERSION = 1;

export const LIMITS = Object.freeze({
  treatments: 30,
  times: 12,
  name: 40,
  person: 40,
  every: 365,
  graceMin: 5,
  graceMax: 720,
  dose: 100,
  stock: 100_000,
});

export const DEFAULT_GRACE = 30;
// Slot records kept, in days (the widget and the 24-hour window need two).
export const KEEP_DAYS = 8;

export const newId = () => randomBytes(6).toString('hex');

/** Trimmed, single-spaced, bounded text. */
export function cleanText(value, max) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}

/** Comparison key of a name: case, accents and blanks ignored. */
export const matchKey = (value) =>
  cleanText(value, 1000)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss');

export const emptyDocument = () => ({ schema: SCHEMA_VERSION, treatments: [] });

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const dateOr = (value, fallback) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
const intIn = (value, min, max, fallback) =>
  Number.isInteger(value) && value >= min && value <= max ? value : fallback;

function normalizeSlots(raw) {
  const slots = {};
  for (const [slot, record] of Object.entries(isObject(raw) ? raw : {})) {
    if (!isSlot(slot) || !isObject(record)) {
      continue;
    }
    const clean = {};
    if (typeof record.taken_at === 'string' && !Number.isNaN(Date.parse(record.taken_at))) {
      clean.taken_at = record.taken_at;
    }
    if (record.due_sent === true) {
      clean.due_sent = true;
    }
    if (record.missed_sent === true) {
      clean.missed_sent = true;
    }
    if (Object.keys(clean).length > 0) {
      slots[slot] = clean;
    }
  }
  return slots;
}

function normalizeTreatment(raw, ids, now) {
  if (!isObject(raw)) {
    return null;
  }
  const name = cleanText(raw.name, LIMITS.name);
  const times = Array.isArray(raw.times)
    ? [...new Set(raw.times.filter(isTime))].sort().slice(0, LIMITS.times)
    : [];
  if (!name || times.length === 0) {
    return null;
  }
  let id = typeof raw.id === 'string' && /^[a-z0-9]{1,32}$/.test(raw.id) ? raw.id : newId();
  while (ids.has(id)) {
    id = newId();
  }
  ids.add(id);
  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort()
    : [];
  const created = dateOr(raw.created_at, now);
  const start = isDate(raw.start) ? raw.start : created.slice(0, 10);
  const stock = Number.isFinite(raw.stock) ? Math.max(0, Math.min(raw.stock, LIMITS.stock)) : null;
  return {
    ...raw,
    id,
    name,
    person: cleanText(raw.person, LIMITS.person),
    times,
    days: days.length > 0 ? days : [1, 2, 3, 4, 5, 6, 7],
    every: intIn(raw.every, 1, LIMITS.every, 1),
    start,
    end: isDate(raw.end) && raw.end >= start ? raw.end : null,
    since: isSlot(raw.since) ? raw.since : `${start}T00:00`,
    grace: intIn(raw.grace, LIMITS.graceMin, LIMITS.graceMax, DEFAULT_GRACE),
    dose: intIn(raw.dose, 1, LIMITS.dose, 1),
    stock,
    stock_alert:
      stock !== null && Number.isInteger(raw.stock_alert) && raw.stock_alert >= 0
        ? Math.min(raw.stock_alert, LIMITS.stock)
        : null,
    stock_low_notified: raw.stock_low_notified === true,
    created_at: created,
    slots: normalizeSlots(raw.slots),
  };
}

/**
 * A well-formed document from whatever JSON was read.
 * @param {unknown} raw
 * @param {string} now ISO date used for missing creation dates
 * @throws {TypeError} when `raw` is not a treatments document at all
 */
export function normalizeDocument(raw, now = new Date().toISOString()) {
  if (!isObject(raw) || !Array.isArray(raw.treatments)) {
    throw new TypeError('Not a treatments document');
  }
  const ids = new Set();
  const names = new Set();
  const treatments = [];
  for (const entry of raw.treatments) {
    const treatment = normalizeTreatment(entry, ids, now);
    if (!treatment) {
      continue;
    }
    // Names are unique: the Configuration actions find a treatment by name.
    for (let n = 2; names.has(matchKey(treatment.name)); n += 1) {
      treatment.name = `${cleanText(entry.name, LIMITS.name - 4)} (${n})`;
    }
    names.add(matchKey(treatment.name));
    treatments.push(treatment);
  }
  return { ...raw, schema: SCHEMA_VERSION, treatments: treatments.slice(0, LIMITS.treatments) };
}

/** Drop the slot records older than KEEP_DAYS; true when some were dropped. */
export function pruneSlots(treatment, today) {
  const limit = addDays(today, -KEEP_DAYS);
  let pruned = false;
  for (const slot of Object.keys(treatment.slots)) {
    if (slot.slice(0, 10) < limit) {
      delete treatment.slots[slot];
      pruned = true;
    }
  }
  return pruned;
}
