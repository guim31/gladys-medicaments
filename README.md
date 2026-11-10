# Medication reminders for Gladys Assistant

The medications of the household, kept **in Gladys itself**: intake times, a
**Taken** button on the dashboard, scene triggers when it is time and when an
intake is missed (to warn a relative), and a low stock alert. No account, no
cloud: nothing leaves the house.

> **Not a medical device.** This integration is a reminder, which can fail
> (Gladys stopped, a power cut, a scene that does not run). Never rely on it
> alone for a treatment where a missed or doubled dose is dangerous.

## Features

- **Treatments** created from the Configuration screen: a name, an optional
  person (a Gladys user's name or any name), intake times, days of the week or
  every N days, optional first and last day, a delay before an intake counts
  as missed (30 minutes by default), and an optional stock with its alert
  level. A Change action edits only the fields typed (and refills the stock
  with `+30`).
- **One device per treatment**: next intake, taken and planned today, late
  intakes (last 24 hours), stock left.
- **Dashboard widget** "Intakes of the day": today's intakes and yesterday's
  missed ones, with their state, a **Taken** button (the missed ones first)
  and **Cancel an intake** for a tap made by mistake. Each button can be
  hidden.
- **Scene triggers**: time to take, intake missed (after the delay), stock
  low. Each fires once per intake, even across a restart, and can be filtered
  on a treatment and a person.
- **Scene actions**: mark as taken (the nearest intake within 12 hours, or
  today's at a given time: an NFC tag on the pill box), read a treatment's day
  (for an evening summary).
- **Persistence** in one JSON file under `/data`: atomic writes, a backup of
  the previous version, an unreadable file kept aside. Intakes are kept 8
  days.
- **Privacy**: names of treatments and persons never reach the logs, even in
  debug.
- Four languages: English, French, German, Spanish.

## Requirements

- Gladys Assistant **5.2.0** or later.
- Nothing else.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-medicaments`
   (or install **Medication reminders** from the catalog once it is listed).
2. In **Configuration**, click **Create a treatment**: a name and the intake
   times are enough.
3. Open the **Discovery** tab and add the treatment, then put the **Intakes of
   the day** widget on a dashboard.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen. It includes a scene example: missed
intake, message to a relative.

## How it works

The treatments live in `/data/medications.json` (schema version 1), the only
writable path of the sandboxed container. Every change runs alone, on a copy,
is written to a temporary file flushed to disk and renamed over the file (the
previous version is copied to `medications.json.bak` first), and only then is
sent to Gladys: states, scene events, widget refresh.

Intake times are local times (the time zone of Gladys, `TZ`). A timer aligned
on the minute fires "time to take" when an intake comes due and "intake
missed" once its delay is over, in real time even across a daylight saving
change; each event is recorded in the file once Gladys accepted it, so a
restart in the middle of a delay neither repeats nor loses one. The devices
are published with `should_poll: false`; only the values that changed are
sent, plus a 12-hour heartbeat.

## Tested, and what was not

- **Tested** (`npm test`): schedules (days, every N days, first and last day),
  daylight saving changes in Paris, intakes taken early and late, a restart in
  the middle of a delay, events refused by Gladys and sent again, the stock and
  its alert, the forms and their errors, persistence (restart, truncated file,
  failed write), the widget against the SDK's `validateWidgetContent`, the
  conformity of the devices with the feature table of the Gladys core, quiet
  logs without names, the four languages.
- **Tested in the Docker image**, with the constraints of the Gladys sandbox
  (read-only rootfs, all capabilities dropped, 256 MB): the image starts,
  fails cleanly without Gladys, and the treatments written in the volume
  survive a restart of the container.
- **Not tested**: a real Gladys instance. Feedback welcome.

## Limitations

- Not a medical device: a reminder, which can fail.
- 30 treatments, 12 intake times a day each, whole units only.
- The Gladys chat assistant cannot reach the treatments (the SDK has no way to
  expose them): scenes are the way.

## Credits

Written from scratch for Gladys Assistant; the idea follows the medication
tracking setups of the Home Assistant community. Not affiliated with any
pharmaceutical company or health service.

## License

[Apache-2.0](LICENSE).
