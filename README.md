# Sahamly

A personal dashboard for tracking a small watchlist of stocks (mainly Indonesian/IDX-listed) and reading AI-generated deep-dive analysis reports. Single-user, no multi-tenant concerns — built to be simple and fast to run locally.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **Supabase** (Postgres + Auth) for all data storage
- **Gemini API** (`@google/genai`) for the narrative/analysis sections of each report
- **`technicalindicators`** for indicator math (SMA, RSI, volume ratio)
- 100% TypeScript, no Python

## How it works

For each ticker in the watchlist, a pipeline runs in three steps:

1. **Fetch** — `lib/market-data` returns realistic-shaped OHLCV + fundamental + flow data. Today it's a deterministic mock generator; swapping in a real IDX data source later is a one-function change (`fetchTickerData` in `lib/market-data/index.ts`).
2. **Compute** — `lib/indicators` derives moving averages, RSI, a volume ratio, and support/resistance levels straight from the OHLCV, in plain TypeScript. `lib/reports/deterministic.ts` derives entry/exit levels the same way.
3. **Generate** — `lib/reports/generate-report.ts` sends only those computed facts to Gemini and asks it to write the narrative fields (summary, phase, risk notes, etc.). **Every number in a report is computed in TS and validated with zod before storage — the model never invents or restates a number.**

The result of each run is a `snapshots` row (raw facts) and a `reports` row (verdict + narrative, `report_json`).

`lib/pipeline/run-for-ticker.ts` ties fetch → compute → generate together. It's called by the "Refresh report" button on each ticker's detail page — there's no scheduled/cron refresh yet (see [Roadmap](#roadmap)).

## Getting started

### 1. Install dependencies

This project uses `pnpm`:

```bash
pnpm install
```

### 2. Set up Supabase

You need a Supabase project (create one at [supabase.com](https://supabase.com) if you don't have one).

1. Copy the env template and fill in your project's keys (**Settings → API** in the Supabase dashboard):

   ```bash
   cp .env.local.example .env.local
   ```

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   GEMINI_API_KEY=
   ```

2. Apply the schema in `supabase/migrations/` — either paste the SQL file into the Supabase dashboard's SQL Editor, or link the CLI and push:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

3. Create your user: **Authentication → Users → Add user** in the dashboard. This is a single-user app — sign-up isn't exposed in the UI on purpose.

### 3. Get a Gemini API key

Create one at [Google AI Studio](https://aistudio.google.com/) and add it as `GEMINI_API_KEY` in `.env.local`.

### 4. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the user you created above.

## Project structure

```
app/
  login/            Sign-in page and auth server actions
  (app)/             Authenticated routes — shared masthead/ticker-tape layout
    page.tsx          Dashboard: every ticker + latest verdict
    tickers/          Watchlist CRUD
    tickers/[id]/     Report detail page + manual "Refresh report" trigger
lib/
  market-data/       Mock OHLCV/fundamental/flow fetcher (swap point for a real data source)
  indicators/        Deterministic technical indicator computation
  snapshots/         Persists a snapshot row for a ticker
  reports/           Deterministic entry/exit + Gemini narrative generation, zod schemas
  pipeline/          Ties fetch → compute → generate together
  supabase/          Browser/server/middleware/service-role Supabase clients
proxy.ts             Session-refresh proxy (this Next.js version renamed middleware → proxy)
supabase/migrations/ SQL schema (tickers, snapshots, reports)
```

## Roadmap

- **Scheduled refresh** — currently deferred. The manual trigger already wraps the full pipeline (`lib/pipeline/run-for-ticker.ts`); a cron route would just loop over active tickers and call it, triggered by something like Vercel Cron, GitHub Actions, or Supabase `pg_cron`.
- **Real IDX data source** — replace the body of `fetchTickerData` in `lib/market-data/index.ts` once one is chosen.
