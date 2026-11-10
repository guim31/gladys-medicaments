// -----------------------------------------------------------------------------
// What the integration writes: at info, the lifecycle and one line per change
// asked by the user; the minute timer writes nothing. Treatment names and
// persons (health data) never reach the logs, not even in debug.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TENSION, VITAMIN, createAll, createWorld, deviceIds } from './helpers/world.js';

function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  t.mock.method(console, 'warn', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('the minute timer writes nothing at info, even when intakes come due', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  await createAll(w);
  assert.ok(logs.texts().some((text) => text.includes('2 treatment(s) loaded')));
  logs.clear();
  for (let i = 0; i < 4 * 60; i += 1) {
    w.clock.advance(60_000);
    await w.hub.tick();
  }
  assert.ok(w.fake.sceneEvents.length >= 2, 'due and missed fired');
  await w.fake.widgetGet('today', { settings: {}, language: 'en', units: 'metric' });
  await w.fake.sceneAction('read_today', { treatment: deviceIds(w.gladys, TENSION).device });
  assert.deepEqual(logs.texts(), []);
});

test('no name nor person in the logs, even in debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  await createAll(w);
  await w.fake.action('create_treatment', { name: 'Kardegic', person: 'Josiane', times: '09:00' });
  await w.fake.action('update_treatment', { name: 'Kardegic', stock: '3', stock_alert: 5 });
  await w.fake.sceneAction('mark_taken', { treatment: deviceIds(w.gladys, VITAMIN).device });
  await w.fake.action('create_treatment', { name: 'Kardegic', times: '25:00' });
  for (let i = 0; i < 3 * 60; i += 1) {
    w.clock.advance(60_000);
    await w.hub.tick();
  }
  await w.fake.action('delete_treatment', { name: 'Kardegic' });
  const all = logs.texts().join('\n');
  assert.ok(logs.texts().length > 3, 'something was logged');
  for (const secret of ['Kardegic', 'Josiane', 'Tension', 'Paul', 'Vitamine']) {
    assert.ok(!all.includes(secret), `"${secret}" found in the logs`);
  }
});

test('one line per change asked by the user', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  await w.fake.sceneAction('mark_taken', { treatment: deviceIds(w.gladys, VITAMIN).device });
  assert.equal(logs.texts().length, 1);
  assert.match(
    logs.texts()[0],
    /Intake marked as taken \(treatment 0f1e2d3c4b5a, 120 min before its time, scene\)/,
  );
});
