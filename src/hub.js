// -----------------------------------------------------------------------------
// The treatments hub: the document in memory, every change to it, and what
// each change sends to Gladys (devices, states, scene events, widget nudges).
//
// Changes are serialized: each one runs alone on a copy of the document, the
// copy is written to /data, and only then does it become the current
// document. A write that fails changes nothing and is reported to the user.
//
// A minute timer, aligned on the minute, fires "time to take" when an intake
// comes due and "intake missed" once its grace delay is over, each once per
// intake (remembered in the file, so a restart in the middle of a grace
// delay neither repeats nor loses one), then republishes the states: only
// the changes, plus a 12-hour heartbeat.
//
// Privacy: treatment names and persons never reach the logs, at any level;
// a treatment is logged by its random id.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { buildDevice, treatmentIdOf, treatmentIds, treatmentStates } from './devices.js';
import {
  cleanText,
  DEFAULT_GRACE,
  KEEP_DAYS,
  LIMITS,
  matchKey,
  newId,
  pruneSlots,
} from './model.js';
import {
  addDays,
  addMinutes,
  instantOf,
  localNow,
  minutesBetween,
  nextSlot,
  parseDate,
  parseDays,
  parseTimes,
  slotsBetween,
  slotsOn,
} from './schedule.js';
import { message, MESSAGES, nextText, pick, UserError } from './texts.js';

const logger = createLogger({ name: 'medications' });

export const WIDGET_KEY = 'today';

// Scene trigger keys: permanent once published.
export const TRIGGERS = Object.freeze({
  INTAKE_DUE: 'intake_due',
  INTAKE_MISSED: 'intake_missed',
  STOCK_LOW: 'stock_low',
});

// The front shows "no recent value" past 48 h: an unchanged value is sent again.
const HEARTBEAT_MS = 12 * 3600_000;
// Intakes looked at by the timer and counted as late: the last 24 hours.
const WINDOW_MINUTES = 24 * 60;
// "Taken" without a time: the nearest intake within 12 hours, before or after.
const NEAREST_MINUTES = 12 * 60;
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

/** True when the stock is at or below its alert level, false above, null untracked. */
const stockLow = (treatment) =>
  treatment.stock === null || treatment.stock_alert === null
    ? null
    : treatment.stock <= treatment.stock_alert;

const empty = (value) => value === undefined || value === null || String(value).trim() === '';
const clears = (value) => typeof value === 'string' && value.trim() === '-';

/** An optional whole number of a form: undefined when empty, NaN when not a number. */
function optionalInt(value) {
  if (empty(value)) {
    return undefined;
  }
  const number = Number(String(value).trim().replace(',', '.'));
  return Number.isInteger(number) ? number : Number.NaN;
}

export class TreatmentsHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {import('./store.js').TreatmentStore} options.store
   * @param {() => number} [options.now] clock, milliseconds
   * @param {string} [options.timeZone] IANA time zone, TZ of the container by default
   * @param {boolean} [options.timers] run the minute timer (off in the tests)
   */
  constructor({ gladys, store, now = Date.now, timeZone, timers = true }) {
    this.gladys = gladys;
    this.store = store;
    this.now = now;
    this.timeZone = timeZone;
    this.timers = timers;
    this.config = { language: 'fr' };
    this.document = { schema: 1, treatments: [] };
    this.queue = Promise.resolve();
    this.timer = null;
    // Problems logged once, until they are over (key → message).
    this.problems = new Map();
    // False until the file was read: no change may run on an empty document
    // that would then replace the real treatments on disk.
    this.loaded = false;
    // Events sent but not yet recorded in the file (`id:slot:key`), and the
    // guard against two overlapping ticks.
    this.sentPending = new Set();
    this.ticking = false;
    // What the widget showed at the last tick: a change asks for a refresh.
    this.widgetSignature = '';
  }

  // --- Quiet logs: one line when a problem starts, one when it ends --------

  problem(key, text) {
    if (!this.problems.has(key)) {
      logger.warn(text);
    } else {
      logger.debug(text);
    }
    this.problems.set(key, text);
  }

  resolved(key) {
    if (this.problems.delete(key)) {
      logger.info(`Back to normal: ${key}`);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const { document, source } = await this.store.load();
    this.document = document;
    this.loaded = true;
    logger.info(
      `${document.treatments.length} treatment(s) loaded (${source === 'new' ? 'first start' : source})`,
    );
    if (source === 'backup') {
      await this.store.save(document).catch((err) => logger.error(`Cannot write: ${err.message}`));
    }
    if (this.timers && !this.timer) {
      this.scheduleTick();
    }
    await this.resync(config);
  }

  /** The next tick, a second after the next minute starts. */
  scheduleTick() {
    const delay = 60_000 - (this.now() % 60_000) + 1000;
    this.timer = setTimeout(() => {
      this.tick()
        .catch((err) => this.problem('tick', `Minute check failed: ${err.message}`))
        .finally(() => {
          if (this.timer) {
            this.scheduleTick();
          }
        });
    }, delay);
    this.timer.unref?.();
  }

  /** After a (re)connection: send again what Gladys may have lost. */
  async resync(config) {
    this.config = config;
    await this.publishDevices();
    this.gladys.forgetPublishedStates();
    await this.tick();
    await this.gladys.setConnectionStatus(true);
  }

  async reconfigure(config) {
    const languageChanged = config.language !== this.config.language;
    this.config = config;
    if (languageChanged) {
      // Feature names of devices not added yet, and the "next intake" texts.
      await this.publishDevices();
      await this.publishStates();
      this.refreshWidget();
    }
  }

  async stop() {
    clearTimeout(this.timer);
    this.timer = null;
    await this.queue.catch(() => {});
    await this.store.flush();
  }

  // --- Reading ---------------------------------------------------------------

  local() {
    return localNow(this.now(), this.timeZone);
  }

  get treatments() {
    return this.document.treatments;
  }

  /** The treatment of a device external id, null when it no longer exists. */
  treatmentOfDevice(externalId) {
    const id = treatmentIdOf(this.gladys, externalId);
    return this.treatments.find((treatment) => treatment.id === id) ?? null;
  }

  /** The name the user sees: the device name given in Gladys, else the treatment name. */
  displayName(treatment) {
    const deviceId = treatmentIds(this.gladys, treatment.id).device;
    const device = (this.gladys.devices ?? []).find((entry) => entry.external_id === deviceId);
    return device?.name || treatment.name;
  }

  /** Treatments whose device was added in Gladys. */
  createdTreatments() {
    const created = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    return this.treatments.filter((treatment) =>
      created.has(treatmentIds(this.gladys, treatment.id).device),
    );
  }

  /**
   * State of one intake at `minute`: `taken`, `late` (past the grace delay),
   * `due` (time passed, within the delay) or `upcoming`.
   */
  slotState(treatment, slot, local) {
    if (treatment.slots[slot]?.taken_at) {
      return 'taken';
    }
    // In real time, across a daylight saving change too: the clock shows the
    // repeated autumn hour again, the intake is no longer "upcoming".
    const instant = instantOf(slot, this.timeZone);
    if (local.minute < slot && local.at < instant) {
      return 'upcoming';
    }
    return local.at >= instant + treatment.grace * 60_000 ? 'late' : 'due';
  }

  /** The intakes of the last 24 hours not taken and past their grace delay. */
  lateSlots(treatment, local = this.local()) {
    return this.pastSlots(treatment, local).filter(
      (slot) => this.slotState(treatment, slot, local) === 'late',
    );
  }

  /**
   * The intakes of the last 24 hours whose time has come. One hour ahead of
   * the clock is looked at too: during the repeated autumn hour, the clock
   * shows 02:00 again after a 02:30 intake.
   */
  pastSlots(treatment, local) {
    return slotsBetween(
      treatment,
      addMinutes(local.minute, -WINDOW_MINUTES),
      addMinutes(local.minute, 60),
    ).filter((slot) => this.slotState(treatment, slot, local) !== 'upcoming');
  }

  /** Figures of a treatment now: next intake text, taken / planned today, late. */
  status(treatment, language = this.config.language, local = this.local()) {
    const today = slotsOn(treatment, local.date);
    const next = nextSlot(treatment, local.minute);
    return {
      next: nextText(next, local.date, language, {
        ended: Boolean(treatment.end && treatment.end < local.date) || (!next && !!treatment.end),
      }),
      nextSlot: next,
      taken: today.filter((slot) => treatment.slots[slot]?.taken_at).length,
      planned: today.length,
      late: this.lateSlots(treatment, local).length,
    };
  }

  /**
   * The intakes the widget shows: today's, plus the late ones of the last
   * 24 hours (yesterday evening's missed pill), in time order.
   */
  dayView(treatments = this.treatments, local = this.local()) {
    const rows = [];
    for (const treatment of treatments) {
      const slots = new Set([
        ...this.lateSlots(treatment, local),
        ...slotsOn(treatment, local.date),
      ]);
      for (const slot of slots) {
        rows.push({
          treatment,
          slot,
          state: this.slotState(treatment, slot, local),
          taken_at: treatment.slots[slot]?.taken_at ?? null,
        });
      }
    }
    return rows.sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
  }

  /** Approximate days of stock left, at the planned pace. */
  daysLeft(treatment) {
    const perWeek = treatment.every > 1 ? 7 / treatment.every : treatment.days.length;
    const perDay = (treatment.times.length * treatment.dose * perWeek) / 7;
    return perDay > 0 ? Math.floor(treatment.stock / perDay) : 0;
  }

  // --- Publishing ------------------------------------------------------------

  async publishDevices() {
    try {
      await this.gladys.publishDiscoveredDevices(
        this.treatments.map((treatment) =>
          buildDevice(this.gladys, treatment, this.config.language),
        ),
      );
      this.resolved('devices');
    } catch (err) {
      this.problem('devices', `Devices not published: ${err.message}`);
    }
  }

  async publishStates(treatments = this.createdTreatments()) {
    const local = this.local();
    const states = treatments.flatMap((treatment) =>
      treatmentStates(this.gladys, treatment, this.status(treatment, this.config.language, local)),
    );
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States not published: ${err.message}`);
    }
  }

  /** Publish scene events; resolves with the ones Gladys accepted. */
  async fire(events) {
    const sent = [];
    for (const event of events) {
      try {
        await this.gladys.publishSceneEvent(event.key, event.data);
        sent.push(event);
        this.resolved('scene-event');
      } catch (err) {
        this.problem('scene-event', `Scene event ${event.key} refused: ${err.message}`);
      }
    }
    return sent;
  }

  refreshWidget() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not sent: ${err.message}`);
    }
  }

  async onDeviceCreated(device) {
    const treatment = this.treatmentOfDevice(device?.external_id);
    if (treatment) {
      this.gladys.forgetPublishedStates(device.external_id);
      await this.publishStates([treatment]);
    }
    this.refreshWidget();
  }

  onDeviceChanged() {
    this.refreshWidget();
  }

  // --- Changes ---------------------------------------------------------------

  /**
   * Run one change on a copy of the document, write it, then make it current
   * and send its effects. `change(draft, effects)` fills `effects.events`,
   * sets `effects.changed`, and `effects.structure` when devices change.
   * @param {{ source?: string, tick?: boolean }} [options] `widget`: the core
   *   reloads the widget itself; `tick`: run the timer once done (stock alert)
   */
  mutate(change, { source, tick = false } = {}) {
    const run = this.queue.then(async () => {
      if (!this.loaded) {
        throw new Error('The treatments are not loaded: see the integration logs');
      }
      const draft = structuredClone(this.document);
      const effects = { events: [], structure: false, changed: false };
      const result = change(draft, effects);
      if (!effects.changed) {
        return result;
      }
      try {
        await this.store.save(draft);
      } catch (err) {
        logger.error(`Cannot write the treatments: ${err.message}`);
        throw new UserError('saveFailed');
      }
      this.document = draft;
      if (effects.structure) {
        await this.publishDevices();
      }
      await this.publishStates();
      await this.fire(effects.events);
      if (source !== 'widget') {
        this.refreshWidget();
      }
      return result;
    });
    this.queue = run.catch(() => {});
    return tick ? this.afterChange(run) : run;
  }

  draftTreatment(draft, { device, treatmentId }) {
    const id = treatmentId ?? treatmentIdOf(this.gladys, device);
    const treatment = draft.treatments.find((entry) => entry.id === id);
    if (!treatment) {
      throw new UserError('unknownTreatment');
    }
    return treatment;
  }

  draftByName(draft, name) {
    const wanted = matchKey(name);
    // The treatment's own name first; the name given in Gladys only when it
    // designates one treatment and no other.
    let found = draft.treatments.find((entry) => matchKey(entry.name) === wanted);
    if (!found) {
      const byDevice = draft.treatments.filter(
        (entry) => matchKey(this.displayName(entry)) === wanted,
      );
      found = byDevice.length === 1 ? byDevice[0] : null;
    }
    if (!found) {
      throw new UserError('noTreatmentNamed', cleanText(name, LIMITS.name));
    }
    return found;
  }

  eventBase(treatment) {
    return {
      treatment: treatmentIds(this.gladys, treatment.id).device,
      treatment_name: this.displayName(treatment),
      person: treatment.person,
    };
  }

  /**
   * Re-arm "stock low" once the stock is above its alert level (or no longer
   * tracked). The event itself goes out from the timer (`checkIntakes`), and
   * `stock_low_notified` is set only once Gladys accepted it.
   */
  checkStock(treatment) {
    if (stockLow(treatment) === false) {
      treatment.stock_low_notified = false;
    }
  }

  /** Run the timer right after a change: "stock low" goes out at once. */
  async afterChange(change) {
    const result = await change;
    // The change is saved: a failing timer run must not report it as failed.
    await this.tick().catch((err) => this.problem('tick', `Minute check failed: ${err.message}`));
    return result;
  }

  /**
   * Apply the fields of the create or update form to a treatment (a draft).
   * Empty fields keep the current value; `-` clears an optional one.
   */
  applyFields(treatment, fields, { creating }) {
    const local = this.local();
    let scheduleChanged = creating;
    if (!empty(fields.person)) {
      treatment.person = clears(fields.person) ? '' : cleanText(fields.person, LIMITS.person);
    }
    if (!empty(fields.times) || creating) {
      let times;
      try {
        times = parseTimes(fields.times);
      } catch (err) {
        throw new UserError('badTimes', '', err.message);
      }
      if (times.length === 0) {
        throw new UserError('noTimes');
      }
      if (times.length > LIMITS.times) {
        throw new UserError('tooManyTimes', '', '', LIMITS.times);
      }
      scheduleChanged ||= times.join() !== treatment.times.join();
      treatment.times = times;
    }
    const every = optionalInt(fields.every_days);
    if (every !== undefined && !(every >= 1 && every <= LIMITS.every)) {
      throw new UserError('badEvery', '', '', LIMITS.every);
    }
    let days;
    if (!empty(fields.days)) {
      try {
        days = parseDays(fields.days);
      } catch (err) {
        throw new UserError('badDays', '', err.message);
      }
    }
    if (days && days.length < 7 && every > 1) {
      throw new UserError('daysAndEvery');
    }
    if (every !== undefined) {
      scheduleChanged ||= every !== treatment.every;
      treatment.every = every;
      if (every > 1) {
        treatment.days = [...ALL_DAYS];
      }
    }
    if (days) {
      scheduleChanged ||= days.join() !== treatment.days.join();
      treatment.days = days;
      if (days.length < 7) {
        treatment.every = 1;
      }
    }
    const date = (key) => {
      try {
        return parseDate(fields[key], local.date);
      } catch (err) {
        throw new UserError('badDate', '', err.message);
      }
    };
    if (!empty(fields.start_date)) {
      const start = date('start_date');
      scheduleChanged ||= start !== treatment.start;
      treatment.start = start;
    }
    if (!empty(fields.end_date)) {
      treatment.end = clears(fields.end_date) ? null : date('end_date');
    }
    if (treatment.end && treatment.end < treatment.start) {
      throw new UserError('endBeforeStart');
    }
    const grace = optionalInt(fields.grace_minutes);
    if (grace !== undefined) {
      if (!(grace >= LIMITS.graceMin && grace <= LIMITS.graceMax)) {
        throw new UserError('badGrace', '', '', LIMITS.graceMax);
      }
      treatment.grace = grace;
    }
    const dose = optionalInt(fields.dose);
    if (dose !== undefined) {
      if (!(dose >= 1 && dose <= LIMITS.dose)) {
        throw new UserError('badDose', '', '', LIMITS.dose);
      }
      treatment.dose = dose;
    }
    if (!empty(fields.stock)) {
      const text = String(fields.stock).trim();
      if (clears(text)) {
        treatment.stock = null;
        treatment.stock_alert = null;
      } else {
        const match = text.match(/^(\+)?\s*(\d{1,6})$/);
        if (!match || (match[1] && creating)) {
          throw new UserError('badStock', '', text);
        }
        const value = Number(match[2]) + (match[1] ? (treatment.stock ?? 0) : 0);
        treatment.stock = Math.min(value, LIMITS.stock);
      }
    }
    const alert = optionalInt(fields.stock_alert);
    if (alert !== undefined) {
      if (!(alert >= 0 && alert <= LIMITS.stock)) {
        throw new UserError('badStock', '', String(fields.stock_alert));
      }
      if (treatment.stock === null) {
        throw new UserError('alertWithoutStock');
      }
      treatment.stock_alert = alert;
    }
    if (scheduleChanged) {
      // Intakes of the new schedule before now are not "missed".
      treatment.since = local.minute;
    }
  }

  createTreatment(fields = {}) {
    return this.mutate(
      (draft, effects) => {
        const name = cleanText(fields.name, LIMITS.name);
        if (!name) {
          throw new UserError('emptyName');
        }
        if (draft.treatments.some((entry) => matchKey(entry.name) === matchKey(name))) {
          throw new UserError('nameTaken', name);
        }
        if (draft.treatments.length >= LIMITS.treatments) {
          throw new UserError('tooMany', '', '', LIMITS.treatments);
        }
        const ids = new Set(draft.treatments.map((entry) => entry.id));
        let id = newId();
        while (ids.has(id)) {
          id = newId();
        }
        const local = this.local();
        const treatment = {
          id,
          name,
          person: '',
          times: [],
          days: [...ALL_DAYS],
          every: 1,
          start: local.date,
          end: null,
          since: local.minute,
          grace: DEFAULT_GRACE,
          dose: 1,
          stock: null,
          stock_alert: null,
          stock_low_notified: false,
          created_at: new Date(this.now()).toISOString(),
          slots: {},
        };
        this.applyFields(treatment, fields, { creating: true });
        this.checkStock(treatment);
        draft.treatments.push(treatment);
        Object.assign(effects, { structure: true, changed: true });
        logger.info(`Treatment ${id} created`);
        return treatment;
      },
      { tick: true },
    );
  }

  updateTreatment(fields = {}) {
    return this.mutate(
      (draft, effects) => {
        const treatment = this.draftByName(draft, fields.name);
        const tracked = treatment.stock !== null;
        if (!empty(fields.new_name)) {
          const name = cleanText(fields.new_name, LIMITS.name);
          if (
            draft.treatments.some(
              (entry) => entry !== treatment && matchKey(entry.name) === matchKey(name),
            )
          ) {
            throw new UserError('nameTaken', name);
          }
          treatment.name = name;
        }
        this.applyFields(treatment, fields, { creating: false });
        this.checkStock(treatment);
        Object.assign(effects, {
          // A stock tracked or no longer tracked adds or removes a feature.
          structure: true,
          changed: true,
        });
        if (tracked !== (treatment.stock !== null)) {
          logger.info(`Treatment ${treatment.id}: stock ${tracked ? 'no longer ' : ''}tracked`);
        }
        logger.info(`Treatment ${treatment.id} updated`);
        return treatment;
      },
      { tick: true },
    );
  }

  deleteTreatment({ name } = {}) {
    return this.mutate((draft, effects) => {
      const treatment = this.draftByName(draft, name);
      draft.treatments = draft.treatments.filter((entry) => entry !== treatment);
      Object.assign(effects, { structure: true, changed: true });
      logger.info(`Treatment ${treatment.id} deleted`);
      return treatment;
    });
  }

  /**
   * Mark an intake as taken: the given slot (widget), the intake of today at
   * `time` (scene), or else the nearest one not taken within 12 hours.
   * @returns {Promise<{ treatment, slot: string, already: boolean }>}
   */
  take({ device, treatmentId, slot, time, source }) {
    return this.mutate(
      (draft, effects) => {
        const treatment = this.draftTreatment(draft, { device, treatmentId });
        const local = this.local();
        const chosen = this.chooseSlot(treatment, { slot, time }, local);
        const record = treatment.slots[chosen] ?? {};
        if (record.taken_at) {
          return { treatment, slot: chosen, already: true };
        }
        const taken = { ...record, taken_at: new Date(this.now()).toISOString() };
        if (treatment.stock !== null) {
          // What was really taken from the stock, given back on a cancel.
          taken.stock_used = Math.min(treatment.dose, treatment.stock);
          treatment.stock -= taken.stock_used;
        }
        treatment.slots[chosen] = taken;
        pruneSlots(treatment, local.date);
        effects.changed = true;
        const offset = minutesBetween(chosen, local.minute);
        logger.info(
          `Intake marked as taken (treatment ${treatment.id}, ${offset >= 0 ? `${offset} min after` : `${-offset} min before`} its time${source ? `, ${source}` : ''})`,
        );
        return { treatment, slot: chosen, already: false };
      },
      { source, tick: true },
    );
  }

  chooseSlot(treatment, { slot, time }, local) {
    if (typeof slot === 'string' && slot !== '') {
      if (!slotsOn(treatment, slot.slice(0, 10)).includes(slot)) {
        throw new UserError('slotGone');
      }
      return slot;
    }
    if (!empty(time)) {
      let wanted;
      try {
        [wanted] = parseTimes(time);
      } catch {
        throw new UserError('badTimes', '', cleanText(String(time), 20));
      }
      const today = `${local.date}T${wanted}`;
      if (!slotsOn(treatment, local.date).includes(today)) {
        throw new UserError('noIntakeAt', treatment.name, wanted);
      }
      return today;
    }
    const candidates = slotsBetween(
      treatment,
      addMinutes(local.minute, -NEAREST_MINUTES),
      addMinutes(local.minute, NEAREST_MINUTES),
    ).filter((candidate) => !treatment.slots[candidate]?.taken_at);
    if (candidates.length === 0) {
      throw new UserError('noIntakeNear', treatment.name);
    }
    // The nearest; on a tie, the earlier one (the late pill before the next).
    return candidates.reduce((best, candidate) =>
      Math.abs(minutesBetween(candidate, local.minute)) <
      Math.abs(minutesBetween(best, local.minute))
        ? candidate
        : best,
    );
  }

  /** Cancel an intake marked by mistake (widget): the stock gets the dose back. */
  untake({ treatmentId, slot, source }) {
    return this.mutate(
      (draft, effects) => {
        const treatment = this.draftTreatment(draft, { treatmentId });
        const record = treatment.slots[slot];
        if (!record?.taken_at) {
          return { treatment, slot, changed: false };
        }
        delete record.taken_at;
        if (treatment.stock !== null) {
          treatment.stock = Math.min(LIMITS.stock, treatment.stock + (record.stock_used ?? 0));
          this.checkStock(treatment);
        }
        delete record.stock_used;
        effects.changed = true;
        logger.info(`Intake cancelled (treatment ${treatment.id}${source ? `, ${source}` : ''})`);
        return { treatment, slot, changed: true };
      },
      { source, tick: true },
    );
  }

  /** What a scene can read of a treatment. */
  readToday(device) {
    const treatment = this.draftTreatment(this.document, { device });
    return { treatment, ...this.status(treatment) };
  }

  /** One line per treatment, for the "Show the treatments" action. */
  summary(language) {
    if (this.treatments.length === 0) {
      return message('noTreatments', language);
    }
    const local = this.local();
    return this.treatments
      .map((treatment) => {
        const shown = this.displayName(treatment);
        const name = treatment.person ? `${shown} (${treatment.person})` : shown;
        const parts = [treatment.times.join(', '), this.status(treatment, language, local).next];
        if (treatment.stock !== null) {
          parts.push(message('stockLeft', language, '', '', Math.floor(treatment.stock)));
        }
        return pick(MESSAGES, language).summary(name, parts.join(' · '));
      })
      .join(' — ');
  }

  // --- Minute timer ----------------------------------------------------------

  /**
   * Fire the intakes that came due or were missed, then republish the
   * states. An intake is remembered as notified only once Gladys accepted
   * its event: while Gladys is unreachable, it is tried again every minute.
   */
  async tick() {
    if (!this.loaded || this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      await this.checkIntakes();
    } finally {
      this.ticking = false;
    }
  }

  async checkIntakes() {
    await this.queue;
    const local = this.local();
    const pending = [];
    if (this.gladys.connected !== false) {
      for (const treatment of this.treatments) {
        if (stockLow(treatment) && !treatment.stock_low_notified) {
          if (!this.sentPending.has(`${treatment.id}:stock:${TRIGGERS.STOCK_LOW}`)) {
            pending.push({
              treatmentId: treatment.id,
              slot: 'stock',
              key: TRIGGERS.STOCK_LOW,
              data: {
                ...this.eventBase(treatment),
                stock: Math.floor(treatment.stock),
                days_left: this.daysLeft(treatment),
              },
            });
          }
        }
        for (const slot of this.pastSlots(treatment, local)) {
          const record = treatment.slots[slot] ?? {};
          const state = this.slotState(treatment, slot, local);
          const key =
            state === 'late' && !record.missed_sent
              ? TRIGGERS.INTAKE_MISSED
              : state === 'due' && !record.due_sent
                ? TRIGGERS.INTAKE_DUE
                : null;
          if (!key || this.sentPending.has(`${treatment.id}:${slot}:${key}`)) {
            continue;
          }
          const data = { ...this.eventBase(treatment), time: slot.slice(11) };
          if (key === TRIGGERS.INTAKE_DUE) {
            data.dose = treatment.dose;
          } else {
            data.minutes_late = Math.round((local.at - instantOf(slot, this.timeZone)) / 60_000);
          }
          pending.push({ treatmentId: treatment.id, slot, key, data });
        }
      }
    }
    const sent = await this.fire(pending);
    for (const { treatmentId, slot, key } of sent) {
      this.sentPending.add(`${treatmentId}:${slot}:${key}`);
    }
    const limit = addDays(local.date, -KEEP_DAYS);
    const prune = this.treatments.some((treatment) =>
      Object.keys(treatment.slots).some((slot) => slot.slice(0, 10) < limit),
    );
    if (sent.length > 0 || prune) {
      await this.mutate((draft, effects) => {
        for (const { treatmentId, slot, key } of sent) {
          const treatment = draft.treatments.find((entry) => entry.id === treatmentId);
          if (!treatment) {
            continue;
          }
          if (key === TRIGGERS.STOCK_LOW) {
            if (stockLow(treatment)) {
              treatment.stock_low_notified = true;
              effects.changed = true;
            }
            continue;
          }
          const record = (treatment.slots[slot] ??= {});
          record.due_sent = true;
          if (key === TRIGGERS.INTAKE_MISSED) {
            record.missed_sent = true;
          }
          effects.changed = true;
        }
        for (const treatment of draft.treatments) {
          effects.changed = pruneSlots(treatment, local.date) || effects.changed;
        }
      })
        .then(() => {
          this.sentPending.clear();
          this.resolved('save');
        })
        .catch((err) => this.problem('save', `Intake events not recorded: ${err.message}`));
    }
    // Only the changes go out (the next intake text, the late count…).
    await this.publishStates();
    // The widget rows change state at the intake times: ask for a refresh then.
    const signature = JSON.stringify([
      local.date,
      this.dayView(this.treatments, local).map((row) => [row.treatment.id, row.slot, row.state]),
    ]);
    if (signature !== this.widgetSignature) {
      if (this.widgetSignature !== '') {
        this.refreshWidget();
      }
      this.widgetSignature = signature;
    }
  }
}
