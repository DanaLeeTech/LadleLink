# Changelog

All notable changes to LadleLink are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Per-ingredient notes can now be reviewed and edited during import review and in the editor,
  and the row preview shows them (for example "2 tbsp butter (melted)").
- ESLint and Prettier config, with a `npm run lint` script.
- CI workflow that lints, tests, and builds on every push to `main` and every pull request.
- Social preview image for shared links, and screenshots in the README.
- Contributor docs: `CONTRIBUTING.md` and a bug report issue template.

### Changed

- When a parsed note is exactly a unit from the unit menu ("to taste", "garnish"), it becomes
  that unit instead of a note, so lines like "Salt, to taste" now show a unit you can change.
- Settings text now uses plain English instead of internal terms.
- The sign-in token is stored under a new local storage key so it matches the project name.
  An existing token is migrated automatically the first time the app loads, so saved sign-ins
  keep working.

### Removed

- The default Capacitor template tests from the Android app.
- Test files named after an old internal codename were renamed after what they test.
