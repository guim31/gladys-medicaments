// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget layout: results of
// the Configuration actions, of the scene actions and of the widget buttons,
// their errors, and the "next intake" text of the devices. Four languages,
// the four of the Gladys interface; German says "du", Spanish "usted".
// test/i18n.test.js checks every table.
//
// Every message is a function of (name, detail, count): the treatment name,
// a short detail (a time, a typed value) and a number, used or not.
// -----------------------------------------------------------------------------

export const LANGUAGE_FALLBACK = 'en';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const MESSAGES = {
  en: {
    created: (name) =>
      `Treatment "${name}" created. Add it in Discovery to use it on the dashboard and in scenes.`,
    updated: (name) => `Treatment "${name}" updated.`,
    deleted: (name) => `Treatment "${name}" deleted. Delete its device in Gladys too.`,
    noTreatments: () => 'No treatment yet: create one with the button above.',
    summary: (name, detail) => `${name}: ${detail}`,
    stockLeft: (name, detail, count) => `stock ${count}`,
    taken: (name, detail) => `${name} (${detail}) marked as taken.`,
    alreadyTaken: (name, detail) => `${name} (${detail}) was already marked as taken.`,
    untaken: (name, detail) => `Intake of ${name} at ${detail} cancelled.`,
    notTaken: (name, detail) => `${name} (${detail}) was not marked as taken.`,
    unknownTreatment: () => 'This treatment no longer exists: choose another one.',
    noTreatmentNamed: (name) => `No treatment is named "${name}".`,
    nameTaken: (name) => `A treatment named "${name}" already exists.`,
    emptyName: () => 'Enter a name for the treatment.',
    noTimes: () => 'Enter at least one intake time, e.g. 08:00, 20:00.',
    badTimes: (name, detail) => `Time not understood ("${detail}"): e.g. 08:00, 20:00.`,
    tooManyTimes: (name, detail, count) => `${count} intake times a day at most.`,
    badDays: (name, detail) => `Day not understood ("${detail}"): e.g. mon, wed, fri or mon-fri.`,
    badEvery: (name, detail, count) => `Every N days: a whole number from 1 to ${count}.`,
    daysAndEvery: () => 'Choose either days of the week or every N days, not both.',
    badDate: (name, detail) => `Date not understood ("${detail}"): e.g. 2026-12-31 or 31/12/2026.`,
    endBeforeStart: () => 'The end date is before the first day.',
    badGrace: (name, detail, count) => `Delay before "missed": 5 to ${count} minutes.`,
    badDose: (name, detail, count) => `Dose per intake: a whole number from 1 to ${count}.`,
    badStock: (name, detail) => `Stock not understood ("${detail}"): e.g. 30, or +30 to add.`,
    alertWithoutStock: () => 'A stock alert needs a stock.',
    tooMany: (name, detail, count) => `${count} treatments at most.`,
    noIntakeNear: (name) => `No intake of ${name} to mark within 12 hours.`,
    noIntakeAt: (name, detail) => `${name} has no intake at ${detail} today.`,
    slotGone: () => 'This intake is no longer planned: reload the widget.',
    saveFailed: () => 'The treatments could not be saved in /data: see the integration logs.',
  },
  fr: {
    created: (name) =>
      `Traitement « ${name} » créé. Ajoutez-le dans Découverte pour l'utiliser au tableau de bord et dans les scènes.`,
    updated: (name) => `Traitement « ${name} » modifié.`,
    deleted: (name) => `Traitement « ${name} » supprimé. Supprimez aussi son appareil dans Gladys.`,
    noTreatments: () => 'Aucun traitement pour le moment : créez-en un avec le bouton ci-dessus.',
    summary: (name, detail) => `${name} : ${detail}`,
    stockLeft: (name, detail, count) => `stock ${count}`,
    taken: (name, detail) => `${name} (${detail}) noté comme pris.`,
    alreadyTaken: (name, detail) => `${name} (${detail}) était déjà noté comme pris.`,
    untaken: (name, detail) => `Prise de ${name} de ${detail} annulée.`,
    notTaken: (name, detail) => `${name} (${detail}) n'était pas noté comme pris.`,
    unknownTreatment: () => "Ce traitement n'existe plus : choisissez-en un autre.",
    noTreatmentNamed: (name) => `Aucun traitement ne s'appelle « ${name} ».`,
    nameTaken: (name) => `Un traitement « ${name} » existe déjà.`,
    emptyName: () => 'Saisissez un nom pour le traitement.',
    noTimes: () => 'Saisissez au moins une heure de prise, ex. 08:00, 20:00.',
    badTimes: (name, detail) => `Heure incomprise (« ${detail} ») : ex. 08:00, 20:00.`,
    tooManyTimes: (name, detail, count) => `${count} heures de prise par jour au maximum.`,
    badDays: (name, detail) => `Jour incompris (« ${detail} ») : ex. lun, mer, ven ou lun-ven.`,
    badEvery: (name, detail, count) => `Tous les N jours : un nombre entier de 1 à ${count}.`,
    daysAndEvery: () =>
      'Choisissez soit des jours de la semaine, soit tous les N jours, pas les deux.',
    badDate: (name, detail) => `Date incomprise (« ${detail} ») : ex. 31/12/2026 ou 2026-12-31.`,
    endBeforeStart: () => 'La date de fin est avant le premier jour.',
    badGrace: (name, detail, count) => `Délai avant « oubliée » : de 5 à ${count} minutes.`,
    badDose: (name, detail, count) => `Dose par prise : un nombre entier de 1 à ${count}.`,
    badStock: (name, detail) => `Stock incompris (« ${detail} ») : ex. 30, ou +30 pour ajouter.`,
    alertWithoutStock: () => "Une alerte de stock demande d'indiquer le stock.",
    tooMany: (name, detail, count) => `${count} traitements au maximum.`,
    noIntakeNear: (name) => `Aucune prise de ${name} à noter à 12 heures près.`,
    noIntakeAt: (name, detail) => `${name} n'a pas de prise à ${detail} aujourd'hui.`,
    slotGone: () => "Cette prise n'est plus prévue : rechargez le widget.",
    saveFailed: () =>
      "Les traitements n'ont pas pu être enregistrés dans /data : voir les logs de l'intégration.",
  },
  de: {
    created: (name) =>
      `Behandlung „${name}“ erstellt. Füge sie unter Erkennung hinzu, um sie im Dashboard und in Szenen zu nutzen.`,
    updated: (name) => `Behandlung „${name}“ geändert.`,
    deleted: (name) => `Behandlung „${name}“ gelöscht. Lösche auch ihr Gerät in Gladys.`,
    noTreatments: () => 'Noch keine Behandlung: Erstelle eine mit der Schaltfläche oben.',
    summary: (name, detail) => `${name}: ${detail}`,
    stockLeft: (name, detail, count) => `Bestand ${count}`,
    taken: (name, detail) => `${name} (${detail}) als eingenommen markiert.`,
    alreadyTaken: (name, detail) => `${name} (${detail}) war schon als eingenommen markiert.`,
    untaken: (name, detail) => `Einnahme von ${name} um ${detail} zurückgenommen.`,
    notTaken: (name, detail) => `${name} (${detail}) war nicht als eingenommen markiert.`,
    unknownTreatment: () => 'Diese Behandlung gibt es nicht mehr: Wähle eine andere.',
    noTreatmentNamed: (name) => `Keine Behandlung heißt „${name}“.`,
    nameTaken: (name) => `Eine Behandlung „${name}“ gibt es schon.`,
    emptyName: () => 'Gib einen Namen für die Behandlung ein.',
    noTimes: () => 'Gib mindestens eine Einnahmezeit ein, z. B. 08:00, 20:00.',
    badTimes: (name, detail) => `Uhrzeit nicht verstanden („${detail}“): z. B. 08:00, 20:00.`,
    tooManyTimes: (name, detail, count) => `Höchstens ${count} Einnahmezeiten pro Tag.`,
    badDays: (name, detail) => `Tag nicht verstanden („${detail}“): z. B. Mo, Mi, Fr oder Mo-Fr.`,
    badEvery: (name, detail, count) => `Alle N Tage: eine ganze Zahl von 1 bis ${count}.`,
    daysAndEvery: () => 'Wähle entweder Wochentage oder alle N Tage, nicht beides.',
    badDate: (name, detail) =>
      `Datum nicht verstanden („${detail}“): z. B. 31.12.2026 oder 2026-12-31.`,
    endBeforeStart: () => 'Das Enddatum liegt vor dem ersten Tag.',
    badGrace: (name, detail, count) => `Frist bis „vergessen“: 5 bis ${count} Minuten.`,
    badDose: (name, detail, count) => `Dosis pro Einnahme: eine ganze Zahl von 1 bis ${count}.`,
    badStock: (name, detail) =>
      `Bestand nicht verstanden („${detail}“): z. B. 30, oder +30 zum Hinzufügen.`,
    alertWithoutStock: () => 'Ein Bestandsalarm braucht einen Bestand.',
    tooMany: (name, detail, count) => `Höchstens ${count} Behandlungen.`,
    noIntakeNear: (name) => `Keine Einnahme von ${name} innerhalb von 12 Stunden zu markieren.`,
    noIntakeAt: (name, detail) => `${name} hat heute keine Einnahme um ${detail}.`,
    slotGone: () => 'Diese Einnahme ist nicht mehr geplant: Lade das Widget neu.',
    saveFailed: () =>
      'Die Behandlungen konnten nicht in /data gespeichert werden: Sieh dir die Protokolle der Integration an.',
  },
  es: {
    created: (name) =>
      `Tratamiento «${name}» creado. Añádalo en Descubrimiento para usarlo en el panel y en las escenas.`,
    updated: (name) => `Tratamiento «${name}» modificado.`,
    deleted: (name) => `Tratamiento «${name}» eliminado. Elimine también su dispositivo en Gladys.`,
    noTreatments: () => 'Todavía no hay ningún tratamiento: cree uno con el botón de arriba.',
    summary: (name, detail) => `${name}: ${detail}`,
    stockLeft: (name, detail, count) => `existencias ${count}`,
    taken: (name, detail) => `${name} (${detail}) marcado como tomado.`,
    alreadyTaken: (name, detail) => `${name} (${detail}) ya estaba marcado como tomado.`,
    untaken: (name, detail) => `Toma de ${name} de las ${detail} anulada.`,
    notTaken: (name, detail) => `${name} (${detail}) no estaba marcado como tomado.`,
    unknownTreatment: () => 'Este tratamiento ya no existe: elija otro.',
    noTreatmentNamed: (name) => `Ningún tratamiento se llama «${name}».`,
    nameTaken: (name) => `Ya existe un tratamiento «${name}».`,
    emptyName: () => 'Introduzca un nombre para el tratamiento.',
    noTimes: () => 'Introduzca al menos una hora de toma, p. ej. 08:00, 20:00.',
    badTimes: (name, detail) => `Hora no entendida («${detail}»): p. ej. 08:00, 20:00.`,
    tooManyTimes: (name, detail, count) => `${count} horas de toma al día como máximo.`,
    badDays: (name, detail) => `Día no entendido («${detail}»): p. ej. lun, mié, vie o lun-vie.`,
    badEvery: (name, detail, count) => `Cada N días: un número entero de 1 a ${count}.`,
    daysAndEvery: () => 'Elija días de la semana o cada N días, pero no ambos.',
    badDate: (name, detail) => `Fecha no entendida («${detail}»): p. ej. 31/12/2026 o 2026-12-31.`,
    endBeforeStart: () => 'La fecha de fin es anterior al primer día.',
    badGrace: (name, detail, count) => `Plazo antes de «olvidada»: de 5 a ${count} minutos.`,
    badDose: (name, detail, count) => `Dosis por toma: un número entero de 1 a ${count}.`,
    badStock: (name, detail) =>
      `Existencias no entendidas («${detail}»): p. ej. 30, o +30 para añadir.`,
    alertWithoutStock: () => 'Una alerta de existencias necesita las existencias.',
    tooMany: (name, detail, count) => `${count} tratamientos como máximo.`,
    noIntakeNear: (name) =>
      `Ninguna toma de ${name} que marcar en las próximas o últimas 12 horas.`,
    noIntakeAt: (name, detail) => `${name} no tiene ninguna toma a las ${detail} hoy.`,
    slotGone: () => 'Esta toma ya no está prevista: recargue el widget.',
    saveFailed: () =>
      'No se han podido guardar los tratamientos en /data: consulte los registros de la integración.',
  },
};

// The "next intake" text of a device, and the words around it.
export const NEXT = {
  en: { today: 'today', tomorrow: 'tomorrow', ended: 'Treatment ended', none: 'None planned' },
  fr: {
    today: "aujourd'hui",
    tomorrow: 'demain',
    ended: 'Traitement terminé',
    none: 'Aucune prévue',
  },
  de: { today: 'heute', tomorrow: 'morgen', ended: 'Behandlung beendet', none: 'Keine geplant' },
  es: {
    today: 'hoy',
    tomorrow: 'mañana',
    ended: 'Tratamiento terminado',
    none: 'Ninguna prevista',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A message in one language. */
export function message(key, language, name = '', detail = '', count = 0) {
  return pick(MESSAGES, language)[key](fit(String(name), 40), fit(String(detail), 40), count);
}

/** The same message in every language (Configuration screen, toasts). */
export const allLanguages = (key, name, detail, count) =>
  Object.fromEntries(
    Object.keys(MESSAGES).map((language) => [
      language,
      message(key, language, name, detail, count),
    ]),
  );

/**
 * An error the user caused and can fix: thrown by the hub, shown in the
 * language of whoever sees it (the configured language).
 */
export class UserError extends Error {
  constructor(key, name = '', detail = '', count = 0) {
    super(message(key, LANGUAGE_FALLBACK, name, detail, count));
    this.name = 'UserError';
    this.key = key;
    this.args = [name, detail, count];
  }

  localized(language) {
    return message(this.key, language, ...this.args);
  }
}

/**
 * The "next intake" text: `today 20:00`, `tomorrow 08:00`, `Mon 08:00`
 * within the week, `16/11 08:00` beyond.
 * @param {string|null} slot local `YYYY-MM-DDTHH:MM`
 * @param {string} today local `YYYY-MM-DD`
 * @param {{ ended: boolean }} state
 */
export function nextText(slot, today, language, { ended }) {
  const words = pick(NEXT, language);
  if (!slot) {
    return ended ? words.ended : words.none;
  }
  const date = slot.slice(0, 10);
  const time = slot.slice(11);
  const [year, month, day] = date.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const [ty, tm, td] = today.split('-').map(Number);
  const days = Math.round((utc - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (days <= 0) {
    return `${words.today} ${time}`;
  }
  if (days === 1) {
    return `${words.tomorrow} ${time}`;
  }
  const format =
    days < 7
      ? { timeZone: 'UTC', weekday: 'short' }
      : { timeZone: 'UTC', day: '2-digit', month: '2-digit' };
  return `${new Intl.DateTimeFormat(language, format).format(new Date(utc))} ${time}`;
}
