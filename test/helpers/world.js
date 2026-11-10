// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a temporary /data, a manual
// clock and the Paris time zone, with the integration wired on top through
// registerHandlers. No timer runs: the tests call `world.hub.tick()`.
// -----------------------------------------------------------------------------

import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { TreatmentStore } from '../../src/store.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const TIME_ZONE = 'Europe/Paris';
// Monday 9 November 2026, 10:00 in Paris.
export const START = Date.UTC(2026, 10, 9, 9, 0, 0);
export const BASE_CONFIG = { language: 'en' };

// A realistic /data/medications.json: two treatments (fictional names).
export const FIXTURE_DIR = new URL('../fixtures/data/', import.meta.url);
export const TENSION = 'a1b2c3d4e5f6';
export const VITAMIN = '0f1e2d3c4b5a';

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const emptyDataDir = () => mkdtempSync(join(tmpdir(), 'gladys-medicaments-'));

/** A temporary /data holding the fixture medications.json. */
export function fixtureDataDir() {
  const dir = emptyDataDir();
  cpSync(new URL('medications.json', FIXTURE_DIR), join(dir, 'medications.json'));
  return dir;
}

export async function createWorld({
  clock = createClock(),
  config = BASE_CONFIG,
  devices = [],
  dataDir = fixtureDataDir(),
  store,
  connect = true,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: store ?? new TreatmentStore(dataDir),
    timers: false,
    now: clock.now,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, app, hub: app.hub, clock, dataDir };
}

export const deviceIds = (gladys, id) => gladys.externalIds('treatment', id);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}
