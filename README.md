# orgnz

A cross-platform college planner (iOS + macOS + web, one codebase). Expo/React
Native for the app, Tauri for the native Mac wrapper, Supabase for auth +
Postgres + storage + edge functions.

This is a real, runnable project skeleton — every screen and function here is
implemented, but you still need to do the one-time setup below (create your
own Supabase project, run the migrations, deploy the edge functions, and
build the app) because those require your own accounts and credentials that
only you can provide.

## 1. Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Install the CLI: `npm install -g supabase`
3. `supabase login`, then from this repo: `supabase link --project-ref YOUR_PROJECT_REF`
4. Push the schema: `supabase db push` (runs the three files in `supabase/migrations/` — tables, RLS policies, storage bucket, fuzzy-search functions).
5. Deploy the edge functions:
   ```
   supabase functions deploy notion-sync
   supabase functions deploy notion-oauth-callback --no-verify-jwt
   supabase functions deploy morning-digest --no-verify-jwt
   ```
6. Set edge function secrets (Notion integration — see step 3 below):
   ```
   supabase secrets set NOTION_CLIENT_ID=... NOTION_CLIENT_SECRET=... NOTION_REDIRECT_URI=https://YOUR-PROJECT.functions.supabase.co/notion-oauth-callback
   ```
7. (Optional, for the morning digest cron) In the SQL editor, enable
   `pg_cron` and `pg_net`, then run the `cron.schedule(...)` snippet at the
   top of `supabase/functions/morning-digest/index.ts`.

## 2. App environment

Copy `.env.example` to `.env` and fill in your project's URL/anon key (Project
Settings → API in the Supabase dashboard):

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 3. Notion integration (optional but recommended)

1. Go to https://www.notion.so/my-integrations → New integration → **Public**.
2. Set the redirect URI to your `notion-oauth-callback` function URL (step 6 above).
3. Copy the Client ID/Secret into the Supabase secrets (step 6) and into `.env`:
   ```
   EXPO_PUBLIC_NOTION_CLIENT_ID=...
   EXPO_PUBLIC_NOTION_REDIRECT_URI=https://YOUR-PROJECT.functions.supabase.co/notion-oauth-callback
   ```
4. In Notion, create a database with these properties (names matter, types in
   parens): `Name` (title), `Category` (select), `Importance` (number),
   `Difficulty` (number), `Due Date` (date), `Status` (select), `Notes`
   (rich text). Share it with your integration.
5. In the app: Settings → Connect Notion → paste that database's id (the
   32-char id in its URL) → Save.
6. On any task, "Send to Notion" creates/updates a page there. Open **Notion
   Calendar** and drag it from the unscheduled tray onto a time — orgnz
   intentionally doesn't auto-schedule.

## 4. Run it

```
npm install
npm start        # Expo dev server — press i for iOS simulator, w for web
```

**iOS (simulator or your iPhone):**
```
npx expo run:ios
```
For a real iPhone you'll need a free Apple ID at minimum (Xcode → Signing &
Capabilities), or a paid developer account to distribute via TestFlight.

**macOS native app (Tauri):**
```
npm install -g @tauri-apps/cli   # if you don't have it
rustup-init                      # Tauri needs the Rust toolchain, if not already installed
npm run tauri:dev                # dev mode
npm run tauri:build               # produces a .dmg / .app in src-tauri/target/release/bundle
```

**Push notifications:** `expo-notifications` needs an Expo push token per
device — Settings → "Enable notifications on this device" registers it. The
`morning-digest` edge function reads `push_tokens` and sends via Expo's push
API, so no Apple Push certificate wrangling is needed for iOS.

## Project layout

```
app/                  expo-router screens (file-based routing)
  (tabs)/              Today, Classes, Performance, Settings
  class/[id].tsx        one class/club/EC: schedule, tasks, deliverable search
  task/[id].tsx          one task: status, deliverables, Notion sync
  add-task.tsx           new task, with fuzzy autocomplete against past tasks
  day-review.tsx          end-of-day completed/in-progress/skipped view
  login.tsx                email/password auth
components/            Card, chips, uploader, charts — shared UI
lib/
  supabase.ts            client + SecureStore/Keychain session persistence
  data.ts                 all CRUD + task_events logging
  schedule.ts              RRULE expansion, conflict detection
  analytics.ts              productivity pattern calculations
  fuzzy.ts                   client-side deliverable search filter
  notion.ts                   Notion sync + OAuth URL builder
supabase/
  migrations/            schema, RLS, storage bucket, fuzzy-search SQL functions
  functions/
    notion-sync/           create/update a Notion page for a task
    notion-oauth-callback/  Notion OAuth token exchange
    morning-digest/          scheduled push notification
src-tauri/              macOS native wrapper around the Expo web export
```

## Notes on the "no repeat login" behavior

Sessions persist via `expo-secure-store` (iOS Keychain) / OS keychain through
Tauri's webview storage on Mac, with `autoRefreshToken: true`. On a trusted
device, the app silently re-establishes your session on launch — you'll only
see the login screen the first time, or after an explicit sign-out, or if you
enable the optional Face ID / Touch ID local lock in Settings.

## Placeholder icons

`assets/` and `src-tauri/icons/` are filled with a simple generated
placeholder mark (purple rounded square, ring + checkmark) so the app builds
today without you needing branding first. Swap `assets/icon.png` (1024×1024)
for your own art whenever you like, then regenerate everything else with:

```
npx expo-optimize                 # optional, re-compresses assets
npx @tauri-apps/cli icon assets/icon.png   # regenerates src-tauri/icons/* including icon.icns
```

## Changelog (this review pass)

The project was previously half-generated — it didn't build. Fixed:

- **Missing `events` (tests/deadlines) feature entirely.** The table existed
  in the schema and was even read by `morning-digest`, but there was no way
  to create, view, or delete one anywhere in the app. Added `listEvents` /
  `createEvent` / `updateEvent` / `deleteEvent`, a Task-vs-Event toggle on
  the add screen, an events section on Today and on each class's detail
  page, and conflict detection against class blocks + other events.
- **Missing assets.** `app.json`/`tauri.conf.json` referenced icon/splash/
  favicon/notification icons and a macOS icon set that didn't exist at all —
  generated a full placeholder set including a real `.icns`.
- **Missing dependency**: `react-native-url-polyfill`, imported but never
  declared in `package.json`.
- **Wrong import path**: `expo-file-system`'s `File` class lives at
  `expo-file-system/next` in SDK 52, not the package root — deliverable
  uploads would have crashed immediately.
- **Dead validation logic** in the add-class screen: the end-after-start
  time check always evaluated to `true` regardless of input.
- **Unbound method bug** in login: extracting `supabase.auth.signInWithPassword`
  into a variable before calling it detaches it from the client and throws.
- **Desktop notifications were never wired up** despite being promised in
  the README — added a Tauri notification plugin capability file, a
  `desktopNotify` helper, and client-side digest polling for the Mac app.
- **`openDeliverable` did nothing on iOS/macOS** (only handled `window.open`
  on web) — added a `Linking.openURL` fallback.
- **Timezone bug** in RRULE expansion: class occurrences could land on the
  wrong calendar day depending on the device's UTC offset. Fixed and
  verified against five timezones from UTC-8 to UTC+14.
- Pinned `search_path` on the two `security definer` SQL functions
  (hardening against search-path hijacking).
- Verified end-to-end: `tsc --noEmit` passes clean, and all three SQL
  migrations were applied against a real local Postgres and exercised with
  actual rows (fuzzy match, class-block conflict detection, events CRUD).
- **`npm run tauri:dev` / `npm start` bundling failure**: `Unable to resolve
  "@opentelemetry/api"`. A recent `@supabase/supabase-js` release
  (2.106.0+) added optional tracing code that Metro can't statically
  resolve. Pinned the dependency to `2.105.4` (exact, not `^`) so a future
  `npm install` can't silently drift back into the broken range.
- **`Cannot find native module 'FileSystemNext'` crash on web/desktop**:
  `expo-file-system/next` was required at module load time regardless of
  platform, but it has no web implementation at all — since Tauri's macOS
  app runs on the same web bundle, this broke both the browser build and
  the native Mac app, not just mobile. Fixed by lazy-requiring it only
  inside the native-only upload path, and routing web file picks through
  the browser's real `File` object (which `expo-document-picker` already
  attaches to each asset on web) instead.
  is a well-known Supabase gotcha — extensions land in a separate
  `extensions` schema, not `public`, so unqualified calls can't find them
  even though the extension shows as installed. Fixed by switching UUIDs to
  the built-in `gen_random_uuid()` (core Postgres since v13, no extension
  needed), explicitly installing `pg_trgm` into `extensions`, schema-
  qualifying the trigram index operator class, and adding `extensions` to
  the two fuzzy-search functions' pinned `search_path`. Re-verified against
  a Postgres instance that mimics Supabase's actual schema layout (`pg_trgm`
  pre-installed in `extensions`, bare session search_path with no
  `extensions` in it) — migrations apply and the RPC functions work.

