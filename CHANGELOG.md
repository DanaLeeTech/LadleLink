# Changelog

All notable changes to LadleLink are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Recipe photos can be uploaded from the editor (and replaced or removed at any time). Uploads are
  shrunk in the browser and stored in `data/photos`; the server caps each file at 8 MB and the
  folder at 500 MB, and a startup sweep deletes photos no recipe points at.
- Import review now offers every photo found on the page as a choice (the same photo in different
  sizes or crops appears once), plus "remove photo" and "upload a photo instead".
- Temperatures written in steps or notes (`200c`, `400F`, `200 °C`, `180–200C`, `300K`) are now
  tappable in the reader and cooking mode: one tap switches between °C and °F, and back. A Settings
  option adds Kelvin to the cycle; temperatures written in K always cycle all three. A small ⓘ next
  to the editor's Steps and Notes labels lists the formats.
- Per-ingredient notes can now be reviewed and edited during import review and in the editor,
  and the row preview shows them (for example "2 tbsp butter (melted)").
- ESLint and Prettier config, with a `npm run lint` script.
- CI workflow that lints, tests, and builds on every push to `main` and every pull request.
- Social preview image for shared links, and screenshots in the README.
- Contributor docs: `CONTRIBUTING.md` and a bug report issue template.

### Changed

- A recipe without a photo no longer shows an empty photo box; the reader starts with the title.
- The public demo keeps no photos at all, including photos offered by an imported page.
- When a parsed note is exactly a unit from the unit menu ("to taste", "garnish"), it becomes
  that unit instead of a note, so lines like "Salt, to taste" now show a unit you can change.
- Settings text now uses plain English instead of internal terms.
- The sign-in token is stored under a new local storage key so it matches the project name.
  An existing token is migrated automatically the first time the app loads, so saved sign-ins
  keep working.

### Removed

- The default Capacitor template tests from the Android app.
- Test files named after an old internal codename were renamed after what they test.
