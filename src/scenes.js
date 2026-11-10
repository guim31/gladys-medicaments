// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+). The
// treatment is a device of the integration (`source: "devices"`).
//
// - `mark_taken`: an NFC tag on the pill box, a button, a voice routine:
//   the nearest intake within 12 hours, or the intake of today at a time;
// - `read_today`: the figures of the day, for an evening summary message.
//
// Errors are thrown in the configured language: a scene shows them as is.
// -----------------------------------------------------------------------------

import { UserError } from './texts.js';

const localize = (hub, fn) => async (fields) => {
  try {
    return await fn(fields ?? {});
  } catch (err) {
    throw err instanceof UserError ? new Error(err.localized(hub.config.language)) : err;
  }
};

export function sceneActions(hub) {
  return {
    mark_taken: localize(hub, async (fields) => {
      const { treatment, slot, already } = await hub.take({
        device: fields.treatment,
        time: fields.time,
        source: 'scene',
      });
      const current = hub.treatments.find((entry) => entry.id === treatment.id) ?? treatment;
      const status = hub.status(current);
      return {
        treatment_name: hub.displayName(current),
        person: current.person,
        time: slot.slice(11),
        already_taken: already,
        taken_today: status.taken,
        planned_today: status.planned,
        ...(current.stock !== null ? { stock: Math.floor(current.stock) } : {}),
      };
    }),

    read_today: localize(hub, async (fields) => {
      const { treatment, next, taken, planned, late } = hub.readToday(fields.treatment);
      return {
        treatment_name: hub.displayName(treatment),
        person: treatment.person,
        taken_today: taken,
        planned_today: planned,
        late,
        next_intake: next,
        ...(treatment.stock !== null ? { stock: Math.floor(treatment.stock) } : {}),
      };
    }),
  };
}

export const SCENE_ACTION_KEYS = Object.keys(sceneActions({ config: {} }));
