# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Medication reminders stored in Gladys (`/data/medications.json`), with no
  account and no cloud: treatments created, changed and deleted from the
  Configuration screen (intake times, days of the week or every N days, first
  and last day, delay before missed, person, stock and its alert level).
- One device per treatment: next intake, taken and planned today, late
  intakes, stock left.
- Dashboard widget "Intakes of the day": today's intakes and yesterday's missed
  ones, with buttons to mark one as taken and to cancel a tap made by mistake
  (each can be hidden).
- Scene triggers: time to take a medication, intake missed, stock low (each
  once per intake, even across a restart).
- Scene actions: mark a medication as taken, read a treatment's day.
- Documentation in English, French, German and Spanish, with a scene example:
  missed intake, message to a relative.
