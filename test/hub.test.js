// -----------------------------------------------------------------------------
// The treatments end to end, against the SDK's fake Gladys: creation from
// the Configuration screen, intakes due and missed (each once), taken early
// or late, a restart in the middle of a grace delay, daylight saving, stock
// and its alert, the scene actions and the widget.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildDevice } from '../src/devices.js';
import {
  TENSION,
  VITAMIN,
  createAll,
  createClock,
  createWorld,
  deviceIds,
  emptyDataDir,
} from './helpers/world.js';

const MINUTE = 60_000;
const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

/** Advance the clock minute by minute, ticking like the container does. */
async function run(w, minutes) {
  for (let i = 0; i < minutes; i += 1) {
    w.clock.advance(MINUTE);
    await w.hub.tick();
  }
}

const state = (w, id, key) => w.fake.lastState(deviceIds(w.gladys, id).feature(key));

test('the fixture treatments are published with their figures of the day', async (t) => {
  const w = await world(t);
  await createAll(w);
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Tension', 'Vitamine D'],
  );
  // Monday 10:00: 08:00 taken, 20:00 to come.
  assert.equal(state(w, TENSION, 'taken_today'), 1);
  assert.equal(state(w, TENSION, 'planned_today'), 2);
  assert.equal(state(w, TENSION, 'late'), 0);
  assert.equal(state(w, TENSION, 'next'), 'today 20:00');
  assert.equal(state(w, TENSION, 'stock'), 28);
  assert.equal(state(w, VITAMIN, 'next'), 'today 12:00');
  assert.equal(state(w, VITAMIN, 'stock'), undefined, 'no stock feature when not tracked');
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('time to take, then missed after the delay: each once', async (t) => {
  const w = await world(t);
  await run(w, 119); // 11:59
  assert.equal(events(w, 'intake_due').length, 0);
  await run(w, 1); // 12:00
  const [due] = events(w, 'intake_due');
  assert.deepEqual(due.data, {
    treatment: deviceIds(w.gladys, VITAMIN).device,
    treatment_name: 'Vitamine D',
    person: '',
    time: '12:00',
    dose: 1,
  });
  await run(w, 59); // 12:59: the delay is 60 minutes
  assert.equal(events(w, 'intake_missed').length, 0);
  await run(w, 1); // 13:00
  assert.equal(events(w, 'intake_missed').length, 1);
  assert.equal(events(w, 'intake_missed')[0].data.minutes_late, 60);
  await run(w, 30);
  assert.equal(events(w, 'intake_due').length, 1, 'never twice');
  assert.equal(events(w, 'intake_missed').length, 1, 'never twice');
});

test('an intake marked taken early fires nothing; late, it ends the late count', async (t) => {
  const w = await world(t);
  await createAll(w);
  const device = deviceIds(w.gladys, VITAMIN).device;
  // 11:50, ten minutes early: the nearest intake is today's 12:00.
  await run(w, 110);
  const early = await w.fake.sceneAction('mark_taken', { treatment: device });
  assert.equal(early.success, true, early.error);
  assert.equal(early.data.outputs.time, '12:00');
  await run(w, 120);
  assert.equal(events(w, 'intake_due').length, 0);
  assert.equal(events(w, 'intake_missed').length, 0);

  // Tension 20:00 missed (delay 30 min), then taken at 21:15.
  await run(w, 6 * 60 + 40); // 20:30
  assert.equal(events(w, 'intake_missed').length, 1);
  assert.equal(state(w, TENSION, 'late'), 1);
  await run(w, 45);
  const late = await w.fake.sceneAction('mark_taken', {
    treatment: deviceIds(w.gladys, TENSION).device,
  });
  assert.equal(late.data.outputs.time, '20:00', 'the late intake, nearer than tomorrow 08:00');
  assert.equal(late.data.outputs.taken_today, 2);
  assert.equal(late.data.outputs.stock, 27);
  assert.equal(state(w, TENSION, 'late'), 0);
  assert.equal(state(w, TENSION, 'next'), 'tomorrow 08:00');
});

test('a restart in the middle of the delay neither repeats nor loses an event', async (t) => {
  const dataDir = emptyDataDir();
  const clock = createClock();
  const first = await createWorld({ dataDir, clock });
  await first.fake.action('create_treatment', { name: 'Antibiotique', times: '10:30' });
  await run(first, 30); // 10:30: due
  assert.equal(events(first, 'intake_due').length, 1);
  await first.app.stop();

  clock.advance(10 * MINUTE); // the container restarts at 10:40
  const second = await world(t, { dataDir, clock });
  assert.equal(events(second, 'intake_due').length, 0, 'due already sent before the restart');
  await run(second, 19); // 10:59
  assert.equal(events(second, 'intake_missed').length, 0);
  await run(second, 1); // 11:00
  assert.equal(events(second, 'intake_missed').length, 1);

  // Stopped through the whole delay of the next one: missed on the restart.
  await second.app.stop();
  clock.advance(24 * 3600_000);
  const third = await world(t, { dataDir, clock });
  assert.equal(events(third, 'intake_missed').length, 1);
  assert.equal(events(third, 'intake_due').length, 0, 'too late to be "time to take"');
});

test('an event Gladys refused is sent again at the next minute', async (t) => {
  const w = await world(t);
  await run(w, 119);
  const original = w.gladys.publishSceneEvent.bind(w.gladys);
  w.gladys.publishSceneEvent = async () => {
    throw new Error('HTTP 503');
  };
  await run(w, 1);
  w.gladys.publishSceneEvent = original;
  await run(w, 1);
  assert.equal(events(w, 'intake_due').length, 1);
});

test('daylight saving: an intake in the skipped hour is due at 03:00', async (t) => {
  // Saturday 28 March 2026, 12:00 in Paris (UTC+1).
  const clock = createClock(Date.UTC(2026, 2, 28, 11, 0));
  const w = await world(t, { dataDir: emptyDataDir(), clock });
  await w.fake.action('create_treatment', { name: 'Nuit', times: '02:30' });
  // To 01:59 local on Sunday (00:59 UTC).
  await run(w, (Date.UTC(2026, 2, 29, 0, 59) - clock.time) / MINUTE);
  assert.equal(events(w, 'intake_due').length, 0);
  await run(w, 1); // 01:00 UTC = 03:00 local
  assert.equal(events(w, 'intake_due').length, 1);
  // The delay runs from 03:30 (the offset of the day before), never from
  // the skipped 02:30: no "missed" at the very minute it is due.
  await run(w, 59);
  assert.equal(events(w, 'intake_missed').length, 0);
  await run(w, 1);
  assert.equal(events(w, 'intake_missed').length, 1);
});

test('daylight saving: the 02:30 of the autumn night is notified once', async (t) => {
  const clock = createClock(Date.UTC(2026, 9, 24, 10, 0));
  const w = await world(t, { dataDir: emptyDataDir(), clock });
  await w.fake.action('create_treatment', { name: 'Nuit', times: '02:30', grace_minutes: 120 });
  // Through both 02:30 of Sunday 25 October, to 06:00 UTC.
  await run(w, (Date.UTC(2026, 9, 25, 6, 0) - clock.time) / MINUTE);
  assert.equal(events(w, 'intake_due').length, 1);
  assert.equal(events(w, 'intake_missed').length, 1);
});

test('stock: taken from at each intake, alert once, re-armed by a refill', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  const created = await w.fake.action('create_treatment', {
    name: 'Levothyrox',
    person: 'Marie',
    times: '07:00, 12:00, 19:00',
    dose: 2,
    stock: '10',
    stock_alert: 6,
  });
  assert.equal(created.success, true, created.error);
  const device = w.fake.discoveredDevices[0].external_id;
  w.clock.advance(2 * 3600_000); // 12:00
  await w.fake.sceneAction('mark_taken', { treatment: device, time: '12:00' });
  assert.equal(events(w, 'stock_low').length, 0, '8 left');
  w.clock.advance(7 * 3600_000); // 19:00
  await w.fake.sceneAction('mark_taken', { treatment: device });
  const [low] = events(w, 'stock_low');
  assert.equal(low.data.stock, 6);
  assert.equal(low.data.days_left, 1, '6 units at 6 a day');
  assert.equal(low.data.person, 'Marie');
  w.clock.advance(12 * 3600_000); // tomorrow 07:00
  const next = await w.fake.sceneAction('mark_taken', { treatment: device });
  assert.equal(next.data.outputs.stock, 4);
  assert.equal(events(w, 'stock_low').length, 1, 'once');

  const refill = await w.fake.action('update_treatment', { name: 'levothyrox', stock: '+30' });
  assert.equal(refill.success, true, refill.error);
  assert.equal(w.hub.treatments[0].stock, 34);
  assert.equal(w.fake.lastState(`${device}:stock`) ?? 34, 34);
  await w.fake.action('update_treatment', { name: 'Levothyrox', stock: '5' });
  assert.equal(events(w, 'stock_low').length, 2, 're-armed by the refill');
});

test('the forms refuse what they do not understand, in the configured language', async (t) => {
  const w = await world(t, { config: { language: 'fr' }, dataDir: emptyDataDir() });
  const cases = [
    [{ name: 'A', times: '25:00' }, /Heure incomprise/],
    [{ name: 'A', times: '08:00', days: 'someday' }, /Jour incompris/],
    [{ name: 'A', times: '08:00', days: 'lun', every_days: 2 }, /pas les deux/],
    [{ name: 'A', times: '08:00', end_date: '31/02/2026' }, /Date incomprise/],
    [{ name: 'A', times: '08:00', start_date: '+5', end_date: '+1' }, /avant le premier jour/],
    [{ name: 'A', times: '08:00', grace_minutes: 2 }, /Délai/],
    [{ name: 'A', times: '08:00', stock_alert: 3 }, /alerte de stock/],
    [{ name: 'A', times: '08:00', stock: '+3' }, /Stock incompris/],
  ];
  for (const [fields, error] of cases) {
    const ack = await w.fake.action('create_treatment', fields);
    assert.equal(ack.success, false, JSON.stringify(fields));
    assert.match(ack.error, error);
  }
  assert.equal(w.hub.treatments.length, 0);
  await w.fake.action('create_treatment', { name: 'Tension', times: '08:00' });
  const twice = await w.fake.action('create_treatment', { name: 'tension', times: '09:00' });
  assert.match(twice.error, /existe déjà/);
});

test('a new schedule takes effect now, without missing the earlier hours', async (t) => {
  const w = await world(t);
  await createAll(w);
  const ack = await w.fake.action('update_treatment', {
    name: 'Tension',
    times: '07:00, 09:00, 21:00',
  });
  assert.equal(ack.success, true, ack.error);
  // 07:00 of the new schedule is before now: not planned today, never missed.
  assert.equal(state(w, TENSION, 'planned_today'), 2);
  await run(w, 120);
  assert.equal(events(w, 'intake_missed').length, 0);
});

test('the widget lists the intakes of the day and ticks them off', async (t) => {
  const w = await world(t, { config: { language: 'fr' } });
  await createAll(w);
  await run(w, 9 * 60 + 40); // 19:40, the noon vitamin missed
  const get = await w.fake.widgetGet('today', { settings: {}, language: 'fr' });
  const { content } = get.data;
  assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
  const [tile, status, take, undo] = content.components;
  assert.equal(tile.value, '1 / 3');
  assert.equal(tile.color, 'danger');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['08:00 · Tension (Paul)', 'Pris 07:52'],
      ['12:00 · Vitamine D', 'Oubliée'],
      ['20:00 · Tension (Paul)', 'À venir'],
    ],
  );
  // The missed one first in the form.
  assert.equal(take.action.fields[0].options[0].value, `${VITAMIN}|2026-11-09T12:00`);
  const tap = await w.fake.widgetAction(
    'today',
    'take',
    {},
    {
      values: { intake: `${TENSION}|2026-11-09T20:00` },
    },
  );
  assert.equal(tap.success, true, tap.error);
  assert.equal(tap.data.message.fr, 'Tension (20:00) noté comme pris.');
  assert.equal(w.hub.treatments[0].stock, 27);
  assert.equal(undo.action.key, 'undo');
  const cancel = await w.fake.widgetAction(
    'today',
    'undo',
    {},
    {
      values: { intake: `${TENSION}|2026-11-09T20:00` },
    },
  );
  assert.equal(cancel.data.message.fr, 'Prise de Tension de 20:00 annulée.');
  assert.equal(w.hub.treatments[0].stock, 28);

  const one = await w.fake.widgetGet('today', {
    settings: { device: deviceIds(w.gladys, VITAMIN).device, hide: ['take', 'undo'] },
    language: 'en',
  });
  assert.equal(one.data.content.components.length, 2, 'buttons hidden');
  // Each referenced device exists: the widget uses values only.
  assert.ok(buildDevice(w.gladys, w.hub.treatments[1]).features.length >= 4);
});

test('read_today and show_treatments give the figures without the logs', async (t) => {
  const w = await world(t);
  const read = await w.fake.sceneAction('read_today', {
    treatment: deviceIds(w.gladys, TENSION).device,
  });
  assert.deepEqual(read.data.outputs, {
    treatment_name: 'Tension',
    person: 'Paul',
    taken_today: 1,
    planned_today: 2,
    late: 0,
    next_intake: 'today 20:00',
    stock: 28,
  });
  const shown = await w.fake.action('show_treatments', {});
  assert.match(shown.data?.message?.en ?? JSON.stringify(shown), /Tension \(Paul\): 08:00, 20:00/);
});

test('slot records are pruned after a week, and the file stays valid', async (t) => {
  const w = await world(t);
  await run(w, 9 * 24 * 60);
  const onDisk = JSON.parse(readFileSync(join(w.dataDir, 'medications.json'), 'utf8'));
  const slots = Object.keys(onDisk.treatments[0].slots);
  assert.ok(
    slots.every((slot) => slot >= '2026-11-10'),
    slots.join(),
  );
});

test('a schedule change keeps the intake already due, and its missed event', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  await w.fake.action('create_treatment', { name: 'Matin', times: '10:30, 20:00' });
  await run(w, 40); // 10:40: due, not missed yet (30 min)
  assert.equal(events(w, 'intake_due').length, 1);
  await w.fake.action('update_treatment', { name: 'Matin', times: '10:30, 20:00, 22:00' });
  await run(w, 20); // 11:00
  assert.equal(events(w, 'intake_missed').length, 1, 'the 10:30 pill is still followed');
  assert.equal(w.hub.status(w.hub.treatments[0]).planned, 3);
});

test('a "stock low" refused by Gladys is sent again', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  await w.fake.action('create_treatment', {
    name: 'Boîte',
    times: '08:00',
    stock: '6',
    stock_alert: 5,
  });
  const original = w.gladys.publishSceneEvent.bind(w.gladys);
  w.gladys.publishSceneEvent = async () => {
    throw new Error('HTTP 503');
  };
  await w.fake.action('update_treatment', { name: 'Boîte', stock: '5' });
  assert.equal(w.hub.treatments[0].stock_low_notified, false);
  w.gladys.publishSceneEvent = original;
  await run(w, 1);
  assert.equal(events(w, 'stock_low').length, 1);
  await run(w, 5);
  assert.equal(events(w, 'stock_low').length, 1, 'once');
});

test('cancelling an intake gives back only what was taken from the stock', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  await w.fake.action('create_treatment', { name: 'Fin', times: '10:30', dose: 2, stock: '1' });
  const id = w.hub.treatments[0].id;
  await w.fake.widgetAction('today', 'take', {}, { values: { intake: `${id}|2026-11-09T10:30` } });
  assert.equal(w.hub.treatments[0].stock, 0);
  await w.fake.widgetAction('today', 'undo', {}, { values: { intake: `${id}|2026-11-09T10:30` } });
  assert.equal(w.hub.treatments[0].stock, 1);
});

test('daylight saving: in autumn, missed after the delay, not an hour later', async (t) => {
  const clock = createClock(Date.UTC(2026, 9, 24, 10, 0));
  const w = await world(t, { dataDir: emptyDataDir(), clock });
  await w.fake.action('create_treatment', { name: 'Nuit', times: '02:30' });
  await run(w, (Date.UTC(2026, 9, 25, 0, 30) - clock.time) / MINUTE); // first 02:30
  assert.equal(events(w, 'intake_due').length, 1);
  await run(w, 30); // 01:00 UTC, the clock shows 02:00 again
  const missed = events(w, 'intake_missed');
  assert.equal(missed.length, 1);
  assert.equal(missed[0].data.minutes_late, 30);
});

test('over ten rows, the widget shows the intakes that matter now', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  for (const name of ['A', 'B', 'C']) {
    await w.fake.action('create_treatment', { name, times: '10:30, 12:00, 14:00, 19:00' });
  }
  w.clock.advance(8 * 3600_000); // 18:00
  for (const treatment of w.hub.treatments) {
    for (const time of ['10:30', '12:00', '14:00']) {
      await w.fake.sceneAction('mark_taken', {
        treatment: deviceIds(w.gladys, treatment.id).device,
        time,
      });
    }
  }
  const get = await w.fake.widgetGet('today', { settings: {}, language: 'en' });
  const { items } = get.data.content.components[1];
  assert.equal(items.length, 10);
  assert.equal(items.filter((item) => item.value === 'Upcoming').length, 3);
  assert.equal(items.at(-1).value, 3, 'three earliest taken rows folded');
});
