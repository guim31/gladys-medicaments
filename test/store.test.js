// -----------------------------------------------------------------------------
// Persistence under /data: the treatments survive a restart, an unreadable
// file falls back on the backup (and is kept for a repair), a failed write
// changes nothing and says so.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeDocument } from '../src/model.js';
import { createWorld, deviceIds, emptyDataDir, fixtureDataDir, VITAMIN } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const onDisk = (dir, name = 'medications.json') =>
  JSON.parse(readFileSync(join(dir, name), 'utf8'));

test('the treatments and their intakes survive a restart', async (t) => {
  const dataDir = emptyDataDir();
  const first = await createWorld({ dataDir });
  await first.fake.action('create_treatment', { name: 'Tension', times: '08:00, 20:00' });
  const [device] = first.fake.discoveredDevices;
  await first.fake.sceneAction('mark_taken', { treatment: device.external_id });
  await first.app.stop();

  const second = await world(t, { dataDir });
  assert.deepEqual(
    second.fake.discoveredDevices.map((entry) => entry.external_id),
    [device.external_id],
    'same treatment, same device',
  );
  assert.equal(Object.values(second.hub.treatments[0].slots)[0].taken_at.length, 24);
  assert.equal(onDisk(dataDir).schema, 1);
});

test('an unreadable file is kept aside and the backup is read', async (t) => {
  const dataDir = fixtureDataDir();
  const first = await createWorld({ dataDir });
  await first.fake.sceneAction('mark_taken', {
    treatment: deviceIds(first.gladys, VITAMIN).device,
  });
  await first.app.stop();
  writeFileSync(join(dataDir, 'medications.json'), '{"schema": 1, "treatm');

  const second = await world(t, { dataDir });
  assert.equal(second.hub.treatments.length, 2, 'restored from medications.json.bak');
  assert.ok(existsSync(join(dataDir, 'medications.json.corrupt')));
  assert.equal(onDisk(dataDir).treatments.length, 2, 'written back at once');
});

test('a failed write changes nothing and tells the user', async (t) => {
  const w = await world(t, { config: { language: 'en' } });
  w.hub.store.write = async () => {
    throw new Error('ENOSPC');
  };
  const ack = await w.fake.sceneAction('mark_taken', {
    treatment: deviceIds(w.gladys, VITAMIN).device,
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /could not be saved/);
  assert.deepEqual(Object.keys(w.hub.treatments[1].slots), ['2026-11-05T12:00']);
});

test('normalization repairs a hand-edited file and keeps unknown fields', () => {
  const document = normalizeDocument({
    schema: 1,
    future: true,
    treatments: [
      { name: 'A', times: ['08:00', 'bad', '08:00'], grace: 9999, stock: -4, extra: 1 },
      { name: 'a', times: ['09:00'] },
      { name: '', times: ['10:00'] },
      { name: 'No times', times: [] },
    ],
  });
  assert.equal(document.future, true);
  assert.deepEqual(
    document.treatments.map((entry) => entry.name),
    ['A', 'a (2)'],
  );
  const [first] = document.treatments;
  assert.deepEqual(first.times, ['08:00']);
  assert.equal(first.grace, 30);
  assert.equal(first.stock, 0);
  assert.equal(first.extra, 1);
});
