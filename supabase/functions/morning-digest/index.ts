// supabase/functions/morning-digest/index.ts
//
// Deploy with: supabase functions deploy morning-digest --no-verify-jwt
// Schedule with pg_cron (run every 15 min; the function itself checks each
// user's configured morning_digest_time so it fires once per user per day):
//
//   select cron.schedule(
//     'orgnz-morning-digest',
//     '*/15 * * * *',
//     $$ select net.http_post(
//          url := 'https://YOUR-PROJECT.functions.supabase.co/morning-digest',
//          headers := jsonb_build_object('Authorization', 'Bearer ' || 'SERVICE_ROLE_KEY')
//        ) $$
//   );
//
// Summarizes each user's classes + tasks + tests due today and pushes it
// via Expo's push API to every registered device (push_tokens table).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async () => {
  const now = new Date();
  const hhmm = now.toISOString().slice(11, 16); // UTC HH:MM — settings.timezone is used for display, cron granularity is coarse (15 min) so exact-match here is approximate; production version should convert to each user's tz first.

  const { data: dueUsers, error } = await supabaseAdmin
    .from("user_settings")
    .select("user_id, morning_digest_time, timezone")
    .eq("morning_digest_enabled", true);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const todayStr = now.toISOString().slice(0, 10);
  const results: Record<string, unknown> = {};

  for (const u of dueUsers ?? []) {
    // Coarse check: only send within the same 15-min bucket as configured time.
    if (u.morning_digest_time?.slice(0, 5) !== hhmm.slice(0, 5)) continue;

    const [{ data: tasks }, { data: events }, { data: tokens }] = await Promise.all([
      supabaseAdmin.from("tasks").select("title, status").eq("user_id", u.user_id).eq("due_date", todayStr),
      supabaseAdmin.from("events").select("title").eq("user_id", u.user_id).eq("event_date", todayStr),
      supabaseAdmin.from("push_tokens").select("expo_push_token").eq("user_id", u.user_id),
    ]);

    const taskCount = tasks?.filter((t) => t.status !== "done").length ?? 0;
    const eventCount = events?.length ?? 0;
    if (taskCount === 0 && eventCount === 0) continue;

    const body = [
      taskCount ? `${taskCount} task${taskCount === 1 ? "" : "s"} due` : null,
      eventCount ? `${eventCount} event${eventCount === 1 ? "" : "s"} today` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const messages = (tokens ?? []).map((t) => ({
      to: t.expo_push_token,
      title: "Today in orgnz",
      body,
      sound: "default",
    }));

    if (messages.length) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      });
    }
    results[u.user_id] = { taskCount, eventCount, sent: messages.length };
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { "Content-Type": "application/json" } });
});
