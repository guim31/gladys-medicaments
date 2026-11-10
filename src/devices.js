// -----------------------------------------------------------------------------
// Gladys devices: one per treatment.
//
// Identity: the random id the treatment got at its creation
// (`treatment` / `<id>`), never its name.
//
// Features (category/type couples of the core table, test/gladys-rules.test.js):
//   - next intake, text/text ("today 20:00", "Mon 08:00"…);
//   - intakes taken today and intakes planned today, counter-sensor/integer;
//   - late intakes (not taken, past the grace delay, last 24 hours),
//     counter-sensor/integer: a scene reads "> 0" on it;
//   - stock left, counter-sensor/integer, only when the stock is tracked.
// Several counters on the device, so the dashboard shows their names, not
// the generic "Counter" label of a feature alone of its type.
//
// Published with should_poll: false: the values change on the integration's
// own actions and on its minute timer (src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { LIMITS } from './model.js';

export const DEVICE_TYPE = 'treatment';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  NEXT: 'next',
  TAKEN: 'taken_today',
  PLANNED: 'planned_today',
  LATE: 'late',
  STOCK: 'stock',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    next: 'Next intake',
    taken: 'Taken today',
    planned: 'Planned today',
    late: 'Late intakes',
    stock: 'Stock left',
  },
  fr: {
    next: 'Prochaine prise',
    taken: "Prises faites aujourd'hui",
    planned: "Prises prévues aujourd'hui",
    late: 'Prises en retard',
    stock: 'Stock restant',
  },
  de: {
    next: 'Nächste Einnahme',
    taken: 'Heute eingenommen',
    planned: 'Heute geplant',
    late: 'Verspätete Einnahmen',
    stock: 'Restbestand',
  },
  es: {
    next: 'Próxima toma',
    taken: 'Tomas hechas hoy',
    planned: 'Tomas previstas hoy',
    late: 'Tomas atrasadas',
    stock: 'Existencias restantes',
  },
};

const counter = (max) => ({
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  // Display bounds only: the core never enforces them.
  min: 0,
  max,
});

export const treatmentIds = (gladys, treatmentId) => gladys.externalIds(DEVICE_TYPE, treatmentId);

/** The treatment id behind a device external id, null for anything else. */
export function treatmentIdOf(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  return typeof externalId === 'string' && externalId.startsWith(prefix)
    ? externalId.slice(prefix.length) || null
    : null;
}

/** The device of a treatment, as published to Gladys. */
export function buildDevice(gladys, treatment, language = 'fr') {
  const ids = treatmentIds(gladys, treatment.id);
  const names = NAMES[language] ?? NAMES.en;
  const features = [
    {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      name: names.next,
      external_id: ids.feature(FEATURE_KEYS.NEXT),
      read_only: true,
      has_feedback: false,
      keep_history: false,
      // NOT NULL in the core, even for a text (422 on "Add to Gladys").
      min: 0,
      max: 0,
    },
    {
      ...counter(LIMITS.times),
      name: names.taken,
      external_id: ids.feature(FEATURE_KEYS.TAKEN),
    },
    {
      ...counter(LIMITS.times),
      name: names.planned,
      external_id: ids.feature(FEATURE_KEYS.PLANNED),
    },
    {
      ...counter(LIMITS.times * 2),
      name: names.late,
      external_id: ids.feature(FEATURE_KEYS.LATE),
    },
  ];
  if (treatment.stock !== null) {
    features.push({
      ...counter(LIMITS.stock),
      name: names.stock,
      external_id: ids.feature(FEATURE_KEYS.STOCK),
    });
  }
  return {
    name: treatment.name,
    external_id: ids.device,
    should_poll: false,
    features,
  };
}

/**
 * The states of a treatment device, in the `publishStates` format.
 * @param {object} gladys
 * @param {object} treatment
 * @param {{ next: string, taken: number, planned: number, late: number }} status
 */
export function treatmentStates(gladys, treatment, status) {
  const ids = treatmentIds(gladys, treatment.id);
  const states = [
    { device_feature_external_id: ids.feature(FEATURE_KEYS.NEXT), text: status.next },
    { device_feature_external_id: ids.feature(FEATURE_KEYS.TAKEN), state: status.taken },
    { device_feature_external_id: ids.feature(FEATURE_KEYS.PLANNED), state: status.planned },
    { device_feature_external_id: ids.feature(FEATURE_KEYS.LATE), state: status.late },
  ];
  if (treatment.stock !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.STOCK),
      state: Math.floor(treatment.stock),
    });
  }
  return states;
}
