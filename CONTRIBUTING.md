# Contributing to LadleLink

Bug reports and pull requests are welcome.

## Prerequisites

- Node 20 or newer.
- Docker, only if you want to run the server the same way production does.

Install dependencies:

```sh
npm install
```

If your machine cannot build `better-sqlite3` (this is common on very new Node versions), use
`npm install --ignore-scripts` instead. The TypeScript packages and the web UI still work; run the
server with Docker:

```sh
docker compose up --build
```

## Commands

```sh
npm test                              # all package and web tests
npm run lint                          # ESLint + Prettier check
npm run build                         # packages, web, and server
npm run build:demo -w @ladlelink/web  # browser-only demo bundle
```

`npm run lint` also checks formatting. To fix formatting automatically:

```sh
npx prettier --write .
```

## Rules

- Tests and lint must pass before you open a pull request.
- Do not edit files in `packages/units/src/generated/`; they are generated.
- Never commit `data/`, `.env`, or any token.
- The public demo stores recipes only in the visitor's browser. Keep it that way: no uploads, no
  server-side storage.
