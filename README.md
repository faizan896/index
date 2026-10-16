# Index

A private library for everything worth reading.

Paste a link and Index saves it at once, then fetches the title, author,
source, date and reading time in the background, and files it under the right
subjects. Search it, mark what you're reading, keep notes, gather reading lists,
and let older reads resurface now and then. It's a personal archive, not a
social network.

---

## Contents

1. [What's here](#whats-here)
2. [Setup](#setup)
3. [Deploying to Vercel](#deploying-to-vercel)
4. [How it works](#how-it-works)
5. [Security](#security)
6. [Development](#development)

---

## What's here

- **Saving.** Paste a URL, press Enter, or paste anywhere on the page. The link
  is validated, normalized (tracking parameters, `www.`, trailing slashes and
  parameter order are folded away) and checked for duplicates, including
  against the canonical URL a page declares. It appears in the list immediately.
- **Metadata.** Title, author, publication, description, publication date,
  canonical URL, language and reading time come from Open Graph, Twitter,
  Dublin Core and Highwire (`citation_*`, for papers) tags and JSON-LD.
  Redirects, paywalls, bot checks, broken links and non-HTML files (PDFs) are
  handled. If a site can't be read, the link is still saved and you can fill in
  the title yourself.
- **Categorization.** Claude reads the title, description and opening text and
  picks from your existing categories, creating a new one only when nothing
  fits. Categories stay broad (shelf-level subjects like *Finance* or
  *Watchmaking*); specific ideas (*Stablecoins*, *Porsche*) become tags.
  Near-duplicates ("Payment" vs "Payments", "AI" vs "Artificial Intelligence")
  are folded into what you already have. Without an Anthropic key, links arrive
  as *Unsorted* and you organize them by hand.
- **Categories you control.** Rename, merge, delete, create and reassign.
  Categories you set by hand are never overwritten by the AI.
- **Search** across titles, sources, descriptions, authors, categories, tags
  and your notes, with stemming and prefix matching ("bank" finds *banking*).
  Combine it with filters for status, favorites, category, source and date
  saved, and sort by recently saved, oldest, alphabetical, recently published
  or best match.
- **Reading states** (Unread, Reading, Finished) and a separate **Favorite**,
  changed inline from the list.
- **Details and notes.** A quiet page for each item with its details,
  categories, tags, collections, your notes, and **Related Reads** drawn only
  from your own library. No AI summaries.
- **Collections.** Your own reading lists. An item can be in several. The AI may
  suggest a collection; nothing is added without you.
- **Rediscover.** Three picks: something saved long ago and never read, a
  favorite, and a random read from the archive.
- **Import and export.** Import bookmarks from CSV (Pocket, Raindrop.io,
  Instapaper or any file with a column of URLs). Export everything as JSON
  (complete) or CSV.
- **Keyboard.** `N` add · `/` search · `J`/`K` move · `Enter` open ·
  `F` favorite · `S` status · `?` all shortcuts.

## Setup

You need Node.js 22.18 or newer, a [Supabase](https://supabase.com) project
(the free tier is plenty), and optionally an
[Anthropic API key](https://console.anthropic.com) for categorization.

Index lives in `apps/index` of this repository. All commands below run from
that directory.

```bash
cd apps/index
npm install
cp .env.example .env.local
```

### 1. Create the database

Apply the SQL files in `supabase/migrations/` in name order. Either:

- **Supabase CLI:** `npx supabase link --project-ref <your-ref>` then
  `npx supabase db push`, or
- **Dashboard:** open *SQL Editor*, paste each file in order, and run it.

They create the tables, row-level security policies, indexes, triggers and the
functions the app calls. There is no seed data.

### 2. Configure sign-in

In Supabase, open *Authentication → URL Configuration*:

- **Site URL:** `http://localhost:3000` for local development, and your
  production URL once deployed.
- **Redirect URLs:** add `http://localhost:3000/auth/callback`,
  `http://localhost:3000/auth/confirm`, and the same two paths on your
  production domain.

**Email sign-in** works out of the box with magic links. For links that also
work when opened in a different browser or on another device, change the
*Magic Link* template (*Authentication → Emails*) to point at the token-hash
route:

```html
<h2>Sign in to Index</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
```

**Google sign-in:** in Google Cloud Console, create an *OAuth client ID*
(type *Web application*) with the authorized redirect URI
`https://<your-project-ref>.supabase.co/auth/v1/callback`. Then in Supabase,
enable *Authentication → Providers → Google* and paste the client ID and secret.

For a personal deployment, set `INDEX_ALLOWED_EMAILS` (below) so that only you
can sign in. You can also turn off new sign-ups in Supabase once your account
exists.

### 3. Environment variables

Fill in `.env.local`:

| Variable | Required | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL (*Project Settings → API*). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | The publishable key (`sb_publishable_…`), or the legacy anon key. Never the secret/service-role key — Index doesn't use one. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Public origin, used in sign-in redirects. `http://localhost:3000` locally. |
| `ANTHROPIC_API_KEY` | no | Enables automatic categorization. Server-only. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5-5`. `claude-haiku-5-5` costs a fraction as much and categorizes well. |
| `INDEX_ALLOWED_EMAILS` | no | Comma-separated emails allowed to sign in. Empty means anyone your Supabase project accepts. |

### 4. Run it

```bash
npm run dev
```

Open http://localhost:3000, sign in, and paste a link.

## Deploying to Vercel

1. Import this repository in Vercel and set **Root Directory** to `apps/index`.
   The framework preset is detected as Next.js.
2. Add the environment variables above (set `NEXT_PUBLIC_SITE_URL` to the
   production URL).
3. Deploy, then add `https://<your-domain>/auth/callback` and
   `https://<your-domain>/auth/confirm` to Supabase's redirect URLs and set the
   Site URL to your domain.

Background work after a save uses Next.js `after()`, which Vercel runs to
completion after the response is sent. Routes allow up to 60 seconds.

## How it works

### Saving a link

```
paste → validate + normalize → duplicate check → insert row → respond
                                                     │
                                       after() ──────┴─→ fetch page → extract metadata → categorize → update row
```

The save responds as soon as the row exists, so the item appears instantly.
The list polls that one item while it's being processed and updates it in
place. A database claim (`claim_link_processing`) stops two workers from
processing the same link, and abandoned claims expire after five minutes.
Each stage records its own outcome (`done`, `failed` with a calm reason, or
`skipped`), so a failure never loses the link. *Try again* on an item, or
*Process now* in Settings, re-runs anything that didn't finish.

### Fetching pages safely

Every URL is user-supplied, so the fetcher (`src/lib/core/net`) is built to be
safe against server-side request forgery:

- only `http`/`https` on ports 80 and 443;
- every hostname is resolved first, and the request is refused if **any**
  address is private, loopback, link-local, multicast, reserved, or an IPv6
  form that embeds one (mapped, NAT64, 6to4, Teredo);
- the connection is pinned to the address that was checked, so DNS rebinding
  can't swap it;
- redirects are followed by hand, at most five, and every hop is re-checked;
- one 10-second deadline covers the whole fetch, and bodies stop at 3 MB
  after decompression (zip bombs included);
- no cookies are sent or kept, and fetched HTML is only parsed for text, never
  rendered.

### Categorization and cost

The classifier sees a compact prompt: the title, description, site, author, a
short excerpt, and the names of your existing categories and collections.
Your notes are never sent. It returns structured JSON, which then passes
through deterministic rules (`src/lib/core/classify`): reuse existing categories
where they fit, fold near-duplicates, cap new categories at one per article,
drop overly specific or generic names, and turn specifics into tags. Results
are cached per link content, so retries and re-saves don't pay twice. The
request uses low effort and, where the model supports it, Anthropic's
server-side refusal fallback.

### Search

Each link carries a weighted full-text vector: title, then categories, tags,
source and author, then description, then notes. Triggers keep it current when
any of those change. Queries are stemmed and prefix-matched; anything a
full-text index can't express (a domain fragment, a stop word) falls back to
substring matching. It stays fast with thousands of items (see the
performance test in `supabase/tests`).

### Related Reads

`related_links()` scores your other items by shared categories and tags,
weighted by how rare each is in your library (sharing *Stablecoins* says more
than sharing *Finance*), plus overlapping title words and the same source.
Semantic embeddings can be added later as one more weighted signal in that
function, for example a `pgvector` column filled in during processing, without
changing the app.

### Import and export

CSV import recognizes Pocket, Raindrop.io and Instapaper exports, Index's own
CSV, and any file with a column of URLs. Optional columns: title, description,
tags, categories (or folder), status, favorite, notes, and date saved. Rows
already in your library are skipped. Imported links are then fetched and
categorized in small batches.

Export as **JSON** for a complete archive (every field, notes, collections), or
**CSV** for spreadsheets.

## Security

- Row-level security on every table: each policy checks
  `user_id = auth.uid()`. Join tables use composite foreign keys, so a row
  can't link one user's item to another user's category, tag or collection,
  even through an application bug.
- The app never uses a service-role key. All database access runs as the
  signed-in user.
- Secrets (`ANTHROPIC_API_KEY`) are read only on the server. The browser talks
  only to this app; a strict Content-Security-Policy enforces it.
- Server actions check the session, validate every input, and return calm
  errors rather than internals. Server logs record error codes, never user
  content.
- Exports guard against spreadsheet formula injection.

## Development

```bash
npm run dev          # http://localhost:3000
npm run lint         # ESLint (next/core-web-vitals + typescript)
npm run typecheck    # tsc --noEmit
npm test             # unit tests (node:test, no extra dependencies)
npm run test:db      # SQL tests against a throwaway local PostgreSQL
npm run check        # lint + typecheck + unit tests
```

`npm run test:db` starts a temporary PostgreSQL cluster if the server
binaries are installed (or set `DATABASE_URL` to an empty database). It applies
`supabase/tests/00_supabase_stub.sql`, a minimal stand-in for Supabase's
`auth` schema and roles, then the migrations, then every
`supabase/tests/*.test.sql`.

### Layout

```
src/
  app/                    routes (App Router)
    (library)/            everything behind sign-in, sharing the sidebar
    api/                  GET endpoints: list pages, item polling, export
    auth/                 sign-in callbacks and sign-out
  components/             UI (ui/ holds the primitives)
  lib/
    core/                 framework-free logic, unit-tested: URLs, safe fetching,
                          metadata extraction, categorization rules, CSV
    server/               Supabase clients, loaders, the processing pipeline
    actions/              server actions (all mutations)
supabase/
  migrations/             schema, policies, functions
  tests/                  SQL tests
```
