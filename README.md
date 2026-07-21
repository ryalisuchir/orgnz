

A sleek, all-in-one productivity app for students that runs seamlessly across your iPhone, Mac, and web browser. Drop in your classes, clubs, and tasks, rate how hard they are, and let the app build your game plan. It automatically tackles your heaviest, most brain-draining work during your peak morning energy hours. Orgnz connects straight to your Notion Calendar so your schedule maps out automatically without the busywork. When you finish a task, you drop in your proof (like a PDF of your completed homework) to build a clean, searchable vault of everything you've conquered.

Over time, Orgnz tracks completion rate by difficulty and scheduled lag (planned vs. finished) to auto-schedule tasks around your body's natural rhythm.

Expo/React Native for the app, Tauri for the native Mac wrapper, Supabase for auth + Postgres + storage + edge functions.

This is a real, runnable project skeleton; every screen and function here is
implemented, but you still need to do the one-time setup below (create your
own Supabase project, run the migrations, deploy the edge functions, and
build the app) because those require your own accounts and credentials that
only you can provide.

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
device, the app silently re-establishes your session on launch; you'll only
see the login screen the first time, or after an explicit sign-out, or if you
enable the optional Face ID / Touch ID local lock in Settings.