# Medication reminders

> **This is not a medical device.** It is a reminder, which can fail (Gladys
> stopped, a power cut, a scene that does not run). Never rely on it alone for
> a treatment where a missed or doubled dose is dangerous: follow your doctor's
> and pharmacist's instructions.

The medications of the household, **kept in Gladys itself**: intake times, a
**Taken** button on the dashboard, a scene when it is time, another when an
intake is missed (to warn a relative), and an alert before the box is empty.
No account, no cloud: nothing leaves the house.

> **Feedback welcome.** This integration was tested with the test Gladys of the
> SDK and in its Docker image, not yet in everyday use with a real Gladys. If
> something does not work as described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-medicaments/issues).

## What you need

- Gladys Assistant 5.2.0 or later (the forms of the widget buttons).
- Nothing else: the treatments are stored by the integration in its own
  volume.

## Set up

1. Install the integration, open its **Configuration** tab.
2. **Create a treatment**:
   - **Name** (e.g. `Blood pressure`) and, optionally, **Person**: who takes
     it, the first name of a Gladys user or any name;
   - **Intake times**, local times separated by commas: `08:00, 20:00`;
   - **Days of the week** (`mon, wed, fri`, `mon-fri`; empty: every day) **or
     Every N days** (`2`: every other day, counted from the first day);
   - **First day** and **Last day** (optional): `2026-12-01`, `01/12/2026`, or
     `+7` for seven days from today;
   - **Delay before missed (minutes)**: how long after the intake time it
     counts as missed (30 by default, 5 to 720);
   - **Units per intake**, **Stock (units)** and **Stock alert at**
     (optional): the stock goes down at each intake, and a scene can warn you
     when it reaches the alert level.
3. Open the **Discovery** tab and add the treatment: it becomes a device of
   Gladys, which you can rename and put in a room.
4. Add the **Intakes of the day** widget to a dashboard.

**Change a treatment**: type its current name, then only what changes (empty
fields are kept). Type `-` to clear the person, the last day or the stock.
Also to refill: **Stock (units)** `+30` adds a box of 30. A new schedule takes
effect at once; the intakes it places earlier in the day are not counted as
missed.

**Show the treatments** lists them with their times, next intake and stock.
**Delete a treatment** deletes it and its history for good: type its exact
name to confirm, then delete its device in Gladys too.

**Language of the feature names**: the language of the names given to the
features when a treatment is added, and of the texts sent to scenes (French by
default).

## Devices

One device per treatment, with:

- **Next intake**: `today 20:00`, `tomorrow 08:00`, `Mon 08:00`, or
  `Treatment ended`;
- **Taken today** and **Planned today**: the intakes of the day;
- **Late intakes**: the intakes of the last 24 hours not taken once their
  delay is over (a scene can watch "greater than 0");
- **Stock left**: only when a stock is entered.

An intake marked as taken in advance (up to 12 hours early) counts for its own
time: it is neither "time to take" nor missed.

## Dashboard

The **Intakes of the day** widget lists today's intakes (and yesterday's
missed ones, for 24 hours) with their state: taken and at what time, to take
now, missed, upcoming. **Taken** opens the list of the intakes not taken yet,
the missed ones first; **Cancel an intake** undoes a tap made by mistake (the
stock gets the dose back). In its settings: one treatment or all of them, and
the buttons to hide.

## Scenes

### Triggers

- **Time to take a medication**: an intake time is reached and the intake is
  not marked as taken. Variables: treatment, person, intake time, units.
- **Medication intake missed**: the intake is still not marked once its delay
  is over. Variables: treatment, person, intake time, minutes late.
- **Medication stock low**: the stock reached its alert level, once until it
  is refilled above it. Variables: treatment, person, stock left, days left.

Each one fires once per intake, even if Gladys or the integration restarts in
between, and can be filtered on a treatment and on a person (typed exactly as
in the treatment).

### Actions

- **Mark a medication as taken**: the nearest intake within 12 hours, or the
  intake of today at a given time (`08:00`). For an NFC tag stuck on the pill
  box, a button or a voice routine.
- **Read a treatment's day**: taken, planned and late intakes, the next one
  and the stock, for an evening summary message.

### Scene example: missed intake, message to a relative

1. Trigger **Medication intake missed**, treatment `Blood pressure` (or empty
   for all).
2. Action **Send a message** (Telegram, notification…) to the relative:

   ```text
   {{triggerEvent.data.person}} has not taken {{triggerEvent.data.treatment_name}} (due at {{triggerEvent.data.time}}).
   ```

Same idea with **Time to take a medication** to make a speaker say it, and
with **Medication stock low** to add the box to a shopping list.

## Your data

Everything stays in the integration's volume (`/data/medications.json`, with
a backup copy): the treatments, and the intakes of the last 8 days, which are
then deleted. Nothing is sent outside the house. Names of treatments and
persons never appear in the logs, even in debug.

## Troubleshooting

- **No "time to take" at the hour**: check the time zone of Gladys (Settings →
  System): the intake times are local times. Check the scene is active.
- **An intake is missing today**: a treatment created or rescheduled during
  the day starts from that moment; earlier intakes are not counted.
- **Error on the widget**: the treatment was deleted; choose another one in its
  settings.
- The logs are in **Integrations → Medication reminders → Logs**.

## Limits

- Not a medical device: a reminder, which can fail.
- 30 treatments, 12 intake times a day each; whole units only (count halves
  of a pill as units).
- No question and answer with the Gladys assistant: scenes only.
- An intake time skipped by the spring clock change is due when the clock
  shows the next minute (03:00); one that happens twice in autumn is notified
  once.
