// -----------------------------------------------------------------------------
// Local times: parsing of the forms, schedules (days of the week, every N
// days, first and last day), and daylight saving changes in Paris.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMinutes,
  localNow,
  nextSlot,
  parseDate,
  parseDays,
  parseTimes,
  slotsBetween,
  slotsOn,
} from '../src/schedule.js';

const treatment = (overrides = {}) => ({
  times: ['08:00', '20:00'],
  days: [1, 2, 3, 4, 5, 6, 7],
  every: 1,
  start: '2026-11-01',
  end: null,
  since: '2026-11-01T00:00',
  slots: {},
  ...overrides,
});

test('intake times: several notations, sorted, without duplicates', () => {
  assert.deepEqual(parseTimes('20:00, 8h; 8:00 12h30 7.05'), ['07:05', '08:00', '12:30', '20:00']);
  assert.deepEqual(parseTimes(''), []);
  assert.throws(() => parseTimes('25:00'), RangeError);
  assert.throws(() => parseTimes('8:75'), RangeError);
  assert.throws(() => parseTimes('morning'), RangeError);
});

test('days of the week in the four languages, ranges included', () => {
  assert.deepEqual(parseDays('mon, wed, fri'), [1, 3, 5]);
  assert.deepEqual(parseDays('lun-ven'), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseDays('Mo, Mi, Fr'), [1, 3, 5]);
  assert.deepEqual(parseDays('mié, sáb'), [3, 6]);
  assert.deepEqual(parseDays('Dienstag Donnerstag'), [2, 4]);
  assert.deepEqual(parseDays('sam-lun'), [1, 6, 7]);
  assert.deepEqual(parseDays('1,7'), [1, 7]);
  assert.deepEqual(parseDays(''), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(parseDays('tous'), [1, 2, 3, 4, 5, 6, 7]);
  assert.throws(() => parseDays('someday'), RangeError);
});

test('dates: ISO, European, relative, and invalid days refused', () => {
  assert.equal(parseDate('2026-12-31', '2026-11-09'), '2026-12-31');
  assert.equal(parseDate('31/12/2026', '2026-11-09'), '2026-12-31');
  assert.equal(parseDate('1.12.2026', '2026-11-09'), '2026-12-01');
  assert.equal(parseDate('+7', '2026-11-09'), '2026-11-16');
  assert.equal(parseDate('', '2026-11-09'), null);
  assert.throws(() => parseDate('31/02/2026', '2026-11-09'), RangeError);
});

test('days of the week, every N days, first and last day', () => {
  const weekdays = treatment({ days: [1, 3, 5] });
  assert.equal(slotsOn(weekdays, '2026-11-09').length, 2, 'Monday');
  assert.equal(slotsOn(weekdays, '2026-11-10').length, 0, 'Tuesday');
  const everyOther = treatment({ every: 2, start: '2026-11-09' });
  assert.equal(slotsOn(everyOther, '2026-11-09').length, 2);
  assert.equal(slotsOn(everyOther, '2026-11-10').length, 0);
  assert.equal(slotsOn(everyOther, '2026-11-11').length, 2);
  assert.equal(slotsOn(everyOther, '2026-11-08').length, 0, 'before the first day');
  const ending = treatment({ end: '2026-11-10' });
  assert.equal(slotsOn(ending, '2026-11-10').length, 2, 'the last day is included');
  assert.equal(slotsOn(ending, '2026-11-11').length, 0);
  assert.equal(nextSlot(ending, '2026-11-10T20:01'), null);
});

test('a new schedule never makes the earlier hours of the day missed', () => {
  const created = treatment({ since: '2026-11-09T10:00' });
  assert.deepEqual(slotsOn(created, '2026-11-09'), ['2026-11-09T20:00']);
  const taken = treatment({
    since: '2026-11-09T10:00',
    slots: { '2026-11-09T08:00': { taken_at: '2026-11-09T07:00:00.000Z' } },
  });
  assert.deepEqual(slotsOn(taken, '2026-11-09'), ['2026-11-09T08:00', '2026-11-09T20:00']);
});

test('next intake skips the ones taken early', () => {
  const t = treatment({ slots: { '2026-11-09T20:00': { taken_at: '2026-11-09T18:50:00.000Z' } } });
  assert.equal(nextSlot(t, '2026-11-09T19:50'), '2026-11-10T08:00');
  assert.equal(nextSlot(t, '2026-11-09T08:00'), '2026-11-09T08:00');
  assert.equal(
    nextSlot(treatment({ every: 30, start: '2026-11-01' }), '2026-11-02T00:00'),
    '2026-12-01T08:00',
  );
});

test('slots across midnight and wall-clock minutes', () => {
  assert.deepEqual(slotsBetween(treatment(), '2026-11-08T19:00', '2026-11-09T09:00'), [
    '2026-11-08T20:00',
    '2026-11-09T08:00',
  ]);
  assert.equal(addMinutes('2026-11-09T23:45', 30), '2026-11-10T00:15');
  assert.equal(addMinutes('2026-11-09T00:10', -30), '2026-11-08T23:40');
});

test('daylight saving: local minutes follow the clock of Paris', () => {
  // Spring forward: 2026-03-29, 02:00 → 03:00 (01:00 UTC).
  assert.equal(localNow(Date.UTC(2026, 2, 29, 0, 59), 'Europe/Paris').minute, '2026-03-29T01:59');
  assert.equal(localNow(Date.UTC(2026, 2, 29, 1, 0), 'Europe/Paris').minute, '2026-03-29T03:00');
  // Fall back: 2026-10-25, 03:00 → 02:00 (01:00 UTC): 02:30 happens twice.
  assert.equal(localNow(Date.UTC(2026, 9, 25, 0, 30), 'Europe/Paris').minute, '2026-10-25T02:30');
  assert.equal(localNow(Date.UTC(2026, 9, 25, 1, 30), 'Europe/Paris').minute, '2026-10-25T02:30');
});
