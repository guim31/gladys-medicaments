// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.2+): `today`.
//
// The use case: the kitchen tablet shows the intakes of the day, and a tap
// marks one as taken (or cancels a tap made by mistake), without opening
// anything else. One treatment (a device chosen in the settings) or, empty,
// all of them.
//
// Budget (8 components: 1 tile, 1 status, 2 buttons, 1 text at most): a tile
// (taken / planned today), a status list (up to 10 rows: today's intakes and
// the late ones of the last 24 hours), "Taken" (a form listing the intakes
// not taken) and "Cancel an intake" (a form listing the taken ones). Each
// button can be hidden in the settings. Forms on widget buttons came with
// Gladys 5.2.0 (#3168).
// -----------------------------------------------------------------------------

import { WIDGET_KEY } from './hub.js';
import { localNow } from './schedule.js';
import { allLanguages, pick, UserError } from './texts.js';

// Action keys of the buttons: permanent once published.
export const ACTIONS = Object.freeze({
  TAKE: 'take',
  UNDO: 'undo',
});
// Values of the `hide` setting, one per button.
export const HIDE_OPTIONS = ['take', 'undo'];
const MAX_ROWS = 10;
const MAX_OPTIONS = 50;

export const TEXT = {
  noTreatment: {
    en: 'No treatment yet: create one in the configuration of the integration.',
    fr: "Aucun traitement pour le moment : créez-en un dans la configuration de l'intégration.",
    de: 'Noch keine Behandlung: Erstelle eine in der Konfiguration der Integration.',
    es: 'Todavía no hay ningún tratamiento: cree uno en la configuración de la integración.',
  },
  unknown: {
    en: 'This treatment no longer exists: choose another device in the widget settings.',
    fr: "Ce traitement n'existe plus : choisissez un autre appareil dans les réglages du widget.",
    de: 'Diese Behandlung gibt es nicht mehr: Wähle ein anderes Gerät in den Widget-Einstellungen.',
    es: 'Este tratamiento ya no existe: elija otro dispositivo en la configuración del widget.',
  },
  nothingToday: {
    en: 'No intake planned today.',
    fr: "Aucune prise prévue aujourd'hui.",
    de: 'Heute ist keine Einnahme geplant.',
    es: 'No hay ninguna toma prevista hoy.',
  },
  today: { en: 'Taken today', fr: 'Prises du jour', de: 'Heute eingenommen', es: 'Tomas de hoy' },
  more: { en: 'More intakes', fr: 'Autres prises', de: 'Weitere Einnahmen', es: 'Más tomas' },
  yesterday: { en: 'yesterday', fr: 'hier', de: 'gestern', es: 'ayer' },
  taken: { en: 'Taken', fr: 'Pris', de: 'Eingenommen', es: 'Tomado' },
  late: { en: 'Missed', fr: 'Oubliée', de: 'Vergessen', es: 'Olvidada' },
  due: { en: 'To take now', fr: 'À prendre', de: 'Jetzt fällig', es: 'Para tomar' },
  upcoming: { en: 'Upcoming', fr: 'À venir', de: 'Später', es: 'Pendiente' },
  take: { en: 'Taken', fr: 'Pris', de: 'Eingenommen', es: 'Tomado' },
  undo: {
    en: 'Cancel an intake',
    fr: 'Annuler une prise',
    de: 'Einnahme zurücknehmen',
    es: 'Anular una toma',
  },
  intake: { en: 'Intake', fr: 'Prise', de: 'Einnahme', es: 'Toma' },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const STYLE = {
  taken: { icon: 'check-circle', color: 'success' },
  late: { icon: 'alert-circle', color: 'danger' },
  due: { icon: 'clock', color: 'warning' },
  upcoming: { icon: 'circle' },
};

function textOnly(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

function rowLabel(hub, row, today, language, withPerson) {
  const when =
    row.slot.slice(0, 10) === today
      ? row.slot.slice(11)
      : `${t(TEXT.yesterday, language)} ${row.slot.slice(11)}`;
  const person = withPerson && row.treatment.person ? ` (${row.treatment.person})` : '';
  return fit(`${when} · ${hub.displayName(row.treatment)}${person}`, 40);
}

function rowValue(hub, row, language) {
  if (row.state !== 'taken') {
    return t(TEXT[row.state], language);
  }
  const at = localNow(Date.parse(row.taken_at), hub.timeZone).minute.slice(11);
  return `${t(TEXT.taken, language)} ${at}`;
}

const options = (hub, rows, today, language, withPerson) =>
  rows.slice(0, MAX_OPTIONS).map((row) => ({
    value: `${row.treatment.id}|${row.slot}`,
    label: { en: rowLabel(hub, row, today, language, withPerson) },
  }));

async function get(hub, { settings = {}, language = 'en' }) {
  if (hub.treatments.length === 0) {
    return textOnly(TEXT.noTreatment, language);
  }
  let treatments = hub.treatments;
  if (settings.device) {
    const one = hub.treatmentOfDevice(settings.device);
    if (!one) {
      return textOnly(TEXT.unknown, language);
    }
    treatments = [one];
  }
  const hidden = new Set(Array.isArray(settings.hide) ? settings.hide : []);
  const local = hub.local();
  const rows = hub.dayView(treatments, local);
  const withPerson = treatments.length > 1;
  const today = rows.filter((row) => row.slot.slice(0, 10) === local.date);
  const components = [
    {
      type: 'value',
      value: `${today.filter((row) => row.state === 'taken').length} / ${today.length}`,
      label: t(TEXT.today, language),
      icon: 'check-circle',
      ...(rows.some((row) => row.state === 'late') ? { color: 'danger' } : {}),
    },
  ];
  if (rows.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothingToday, language) });
  } else {
    // Over ten rows, the ones that matter now: late, due, upcoming, then the
    // latest taken; shown in time order.
    const rank = { late: 0, due: 1, upcoming: 2, taken: 3 };
    const kept =
      rows.length <= MAX_ROWS
        ? rows
        : rows
            .map((row, index) => ({ row, index }))
            .sort(
              (a, b) =>
                rank[a.row.state] - rank[b.row.state] ||
                (a.row.state === 'taken' ? b.index - a.index : a.index - b.index),
            )
            .slice(0, MAX_ROWS - 1)
            .sort((a, b) => a.index - b.index)
            .map(({ row }) => row);
    const items = kept.map((row) => ({
      label: rowLabel(hub, row, local.date, language, withPerson),
      ...STYLE[row.state],
      value: rowValue(hub, row, language),
    }));
    if (rows.length > MAX_ROWS) {
      items.push({
        label: t(TEXT.more, language),
        icon: 'more-horizontal',
        value: rows.length - kept.length,
      });
    }
    components.push({ type: 'status', items });
  }
  // The intakes to take first: the late and due ones, then the upcoming ones.
  const order = { late: 0, due: 1, upcoming: 2 };
  const open = rows
    .filter((row) => row.state !== 'taken')
    .sort((a, b) => order[a.state] - order[b.state]);
  const taken = rows.filter((row) => row.state === 'taken').reverse();
  const field = (list) => [
    {
      key: 'intake',
      type: 'select',
      required: true,
      label: TEXT.intake,
      options: options(hub, list, local.date, language, withPerson),
    },
  ];
  if (!hidden.has('take') && open.length > 0) {
    components.push({
      type: 'button',
      label: t(TEXT.take, language),
      icon: 'check',
      style: 'secondary',
      action: { key: ACTIONS.TAKE, params: {}, fields: field(open) },
    });
  }
  if (!hidden.has('undo') && taken.length > 0) {
    components.push({
      type: 'button',
      label: t(TEXT.undo, language),
      icon: 'rotate-ccw',
      style: 'secondary',
      action: { key: ACTIONS.UNDO, params: {}, fields: field(taken) },
    });
  }
  // Rows change state at the intake times: a short cache.
  return { ttl_seconds: 60, components };
}

// The core does not tell the language of the user who tapped: the toast is
// sent in the four languages, an error in the configured one.
async function action(hub, { actionKey, values = {} }) {
  if (!Object.values(ACTIONS).includes(actionKey)) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  const [treatmentId, slot] = String(values.intake ?? '').split('|');
  try {
    if (!treatmentId || !slot) {
      throw new UserError('slotGone');
    }
    if (actionKey === ACTIONS.TAKE) {
      const { treatment, already } = await hub.take({ treatmentId, slot, source: 'widget' });
      return {
        message: allLanguages(
          already ? 'alreadyTaken' : 'taken',
          hub.displayName(treatment),
          slot.slice(11),
        ),
      };
    }
    const { treatment, changed } = await hub.untake({ treatmentId, slot, source: 'widget' });
    return {
      message: allLanguages(
        changed ? 'untaken' : 'notTaken',
        hub.displayName(treatment),
        slot.slice(11),
      ),
    };
  } catch (err) {
    throw err instanceof UserError ? new Error(err.localized(hub.config.language)) : err;
  }
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
