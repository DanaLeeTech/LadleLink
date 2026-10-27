# LadleLink

**Self-hosted recipe manager that scales with you.**

Try it at **<https://danaleetech.github.io/LadleLink/>** — nothing to install. The demo keeps your recipes in your browser only.

LadleLink is a local-first recipe manager you run yourself — one Docker container, a SQLite file you own. Save a recipe, drag the serving slider, and every ingredient re-scales live, with unit conversions that respect what you're measuring:

1. **Portion scaling.** One slider, all ingredients in step.
2. **Density-aware unit conversion.** Cups ⇄ grams ⇄ ml with a per-ingredient density table, so a cup of flour and a cup of water both convert correctly. Cup size is metric 250 ml by default; US 240 ml is a setting.
3. **Recipe URL import.** Paste a recipe link; structured data, microdata and a plain-text fallback are tried in order.
4. **Tags, notes, source links, JSON export/import.**

## Your recipes stay on your machine

Self-host it and everything — the SQLite database and photos — lives in a folder on your machine. There is no account and no cloud service. It runs anywhere Docker does: a home server, NAS, or Raspberry Pi.

The public demo is the same app built with browser-only storage: recipes live in that visitor's browser (IndexedDB), and the demo stores nothing.

## Run your own copy (Docker)

Docker only — no Node needed:

```sh
docker run -d --name ladlelink -p 8080:8080 -v "$PWD/data:/data" \
  ghcr.io/danaleetech/ladlelink:latest
```

Then open <http://localhost:8080>.

Or clone and use compose (adds `.env` handling):

```sh
git clone https://github.com/DanaLeeTech/LadleLink.git
cd LadleLink
cp .env.example .env          # optional AUTH_TOKEN
docker compose up -d --build
```

Set a strong `AUTH_TOKEN` in `.env` before exposing it beyond your own machine.

| Variable     | Default   | Notes                                      |
|--------------|-----------|--------------------------------------------|
| `PORT`       | `8080`    | Server port                                |
| `DATA_DIR`   | `./data`  | SQLite + photos (in the container: `/data`) |
| `AUTH_TOKEN` | unset     | If set, require `Authorization: Bearer …`  |

## URL import

Import is user-initiated and one URL at a time. On your own instance the server fetches the page behind a guard (private-network block, size and time caps, HTML only, optional ClamAV scan). In the demo the page is fetched through public reader services from your browser and parsed locally.

## Local development

Requires Node 20+.

```sh
npm install
npm test
npm run build
npm run dev          # API http://127.0.0.1:8080, Vite UI http://127.0.0.1:5173
```

The demo build is the same UI with browser storage:

```sh
npm run build:demo -w @ladlelink/web
```

## Android

An Android app (Capacitor) is in development and will be released later.

## Layout

| Path | Role |
|------|------|
| `apps/server` | Express + SQLite API |
| `apps/web` | React UI (full app and demo builds) |
| `apps/mobile` | Capacitor shell (in development) |
| `packages/` | shared TypeScript: types, units, scaling, parser, url-guard, ll-bridge |
| `docker-compose.yml` | self-host stack |

MIT licensed.
