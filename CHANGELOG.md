# Changelog

All notable changes to LadleLink are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- ESLint and Prettier config, with a `npm run lint` script.
- CI workflow that lints, tests, and builds on every push to `main` and every pull request.
- Social preview image for shared links, and screenshots in the README.
- Contributor docs: `CONTRIBUTING.md` and a bug report issue template.

### Changed

- Settings text now uses plain English instead of internal terms.
- The sign-in token is stored under a new local storage key so it matches the project name.
  An existing token is migrated automatically the first time the app loads, so saved sign-ins
  keep working.

### Removed

- The default Capacitor template tests from the Android app.
- Test files named after an old internal codename were renamed after what they test.
