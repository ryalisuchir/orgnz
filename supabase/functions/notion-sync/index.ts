// supabase/functions/notion-sync/index.ts
//
// Deploy with:  supabase functions deploy notion-sync
//
// Two modes:
//   { taskId: string }  — sync a task to Notion (create/update page)
//   { action: "listDatabases" } — return databases accessible to the user
//
// If the stored database_id is actually a page ID (common in new Notion UI
// where /p/ URLs wrap everything), the function auto-resolves it to the
// parent database so users don't need to hunt for the right UUID.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NOTION_VERSION = "2022-06-28";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---- Notion schema helpers ------------------------------------------------

interface NotionProp {
  id: string;
  name: string;
  type: string;
}

const NAME_CANDIDATES: Record<string, string[]> = {
  title:     ["Name", "Task", "Title", "Task Name", "Item", "Topic"],
  importance:["Importance", "Priority", "Urgency", "Important"],
  difficulty:["Difficulty", "Effort", "Complexity", "Hardness"],
  status:    ["Status", "State", "Stage", "Progress"],
  category:  ["Category", "Class", "Subject", "Course", "Type", "Group"],
  dueDate:   ["Due Date", "Due", "Deadline", "Date"],
  notes:     ["Notes", "Note", "Description", "Details", "Body", "Text"],
};

function findByName(props: NotionProp[], candidates: string[], type: string): NotionProp | undefined {
  for (const cand of candidates) {
    const match = props.find(
      (p) => p.name.toLowerCase() === cand.toLowerCase() && p.type === type
    );
    if (match) return match;
  }
  return undefined;
}

function findByType(props: NotionProp[], type: string, usedIds: Set<string>): NotionProp | undefined {
  return props.find((p) => p.type === type && !usedIds.has(p.id));
}

// Map app category colors to Notion's native select option colors.
// Notion Calendar does NOT read these, but they look great in database views.
function notionSelectColor(hex: string | undefined): string {
  if (!hex) return "default";
  // Simple hue-based mapping to Notion's color names.
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  if (d < 0.15) return "gray";
  if (h < 20 || h >= 340) return "red";
  if (h < 45) return "orange";
  if (h < 75) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "teal";
  if (h < 260) return "blue";
  if (h < 300) return "purple";
  return "pink";
}

function buildProperties(task: any, dbProps: NotionProp[], opts: { schedule?: boolean } = {}): { properties: Record<string, unknown>; titlePropName: string } {
  const properties: Record<string, unknown> = {};
  const used = new Set<string>();

  let titleProp = findByName(dbProps, NAME_CANDIDATES.title, "title");
  if (!titleProp) titleProp = findByType(dbProps, "title", used);
  if (titleProp) {
    used.add(titleProp.id);
    properties[titleProp.name] = { title: [{ text: { content: task.title } }] };
  }

  let impProp = findByName(dbProps, NAME_CANDIDATES.importance, "number");
  if (!impProp) impProp = findByType(dbProps, "number", used);
  if (impProp) {
    used.add(impProp.id);
    properties[impProp.name] = { number: task.importance };
  }

  let diffProp = findByName(dbProps, NAME_CANDIDATES.difficulty, "number");
  if (!diffProp) diffProp = findByType(dbProps, "number", used);
  if (diffProp) {
    used.add(diffProp.id);
    properties[diffProp.name] = { number: task.difficulty };
  }

  let statusProp = findByName(dbProps, NAME_CANDIDATES.status, "select");
  if (!statusProp) statusProp = findByType(dbProps, "select", used);
  if (statusProp) {
    used.add(statusProp.id);
    properties[statusProp.name] = { select: { name: task.status.replace("_", " ") } };
  }

  if (task.categories?.name) {
    let catProp = findByName(dbProps, NAME_CANDIDATES.category, "select");
    if (!catProp) catProp = findByType(dbProps, "select", used);
    if (catProp) {
      used.add(catProp.id);
      properties[catProp.name] = {
        select: {
          name: task.categories.name,
          color: notionSelectColor(task.categories.color),
        },
      };
    }
  }

  // Due date → only schedule on Notion Calendar when the user explicitly
  // asks for it. Otherwise leave the date empty so the page stays in the
  // database (and the unscheduled tray) without automatically appearing on
  // the calendar.
  {
    let dateProp = findByName(dbProps, NAME_CANDIDATES.dueDate, "date");
    if (!dateProp) dateProp = findByType(dbProps, "date", used);
    if (dateProp) {
      used.add(dateProp.id);
      if (task.due_date && opts.schedule) {
        properties[dateProp.name] = { date: { start: task.due_date } };
      } else {
        properties[dateProp.name] = { date: null };
      }
    }
  }

  if (task.notes) {
    let noteProp = findByName(dbProps, NAME_CANDIDATES.notes, "rich_text");
    if (!noteProp) noteProp = findByType(dbProps, "rich_text", used);
    if (noteProp) {
      used.add(noteProp.id);
      properties[noteProp.name] = { rich_text: [{ text: { content: task.notes.slice(0, 2000) } }] };
    }
  }

  return { properties, titlePropName: titleProp?.name ?? "Name" };
}

function pageIcon(task: any): { type: "emoji"; emoji: string } {
  // Use a calendar-related emoji so the page looks event-like in Notion.
  if (task.categories?.name) return { type: "emoji", emoji: "📘" };
  return { type: "emoji", emoji: "📅" };
}

function notionError(status: number, body: any): string {
  let hint = "";
  if (status === 401) hint = " — Token expired or revoked. Reconnect Notion in Settings.";
  else if (status === 403) hint = " — No access. In Notion, open the database, click ••• → Add connections → add your integration.";
  else if (status === 404) hint = " — Database not found. Check the ID in Settings. Did you paste a page ID instead of a database ID?";
  else if (status === 400) hint = " — Bad request. The ID may be a page, not a database. Try using the database picker in Settings.";
  const detail = body?.message ?? body?.code ?? "";
  const base = `Notion API error (${status})${hint}`;
  return detail ? `${base} — ${detail}` : base;
}

// Extract a hyphenated Notion UUID from a raw ID or a pasted URL.
// Notion URLs may contain the 32-char ID without hyphens; we normalise it.
function parseNotionId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/([a-f0-9]{8}[-]?[a-f0-9]{4}[-]?[a-f0-9]{4}[-]?[a-f0-9]{4}[-]?[a-f0-9]{12})/i);
  if (match) {
    const id = match[1].replace(/-/g, '');
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  }
  return trimmed;
}

// ---- Helpers for loading user settings & Notion headers -------------------

async function loadUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return { error: "Not authenticated", status: 401 };
  const userId = userData.user.id;

  const { data: settings, error: settingsErr } = await supabase
    .from("user_settings")
    .select("notion_database_id, notion_access_token")
    .eq("user_id", userId)
    .single();
  if (settingsErr || !settings?.notion_access_token) {
    return { error: "Connect Notion in Settings first (no access token)", status: 400 };
  }

  const notionHeaders = {
    Authorization: `Bearer ${settings.notion_access_token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };

  return { userId, supabase, notionHeaders, databaseId: settings.notion_database_id };
}

/** If the stored ID is a Notion page rather than a database, resolve it to
  * its parent database ID via the pages API. */
async function resolveDatabaseId(notionHeaders: Record<string, string>, rawId: string): Promise<string> {
  // Try fetching as a database first — fast path.
  const dbCheck = await fetch(`https://api.notion.com/v1/databases/${rawId}`, { headers: notionHeaders });
  if (dbCheck.ok) return rawId;

  // Not a database — try fetching as a page and inspect its parent.
  const pageCheck = await fetch(`https://api.notion.com/v1/pages/${rawId}`, { headers: notionHeaders });
  if (!pageCheck.ok) return rawId; // can't resolve, return original so error is clear

  const page: any = await pageCheck.json();
  if (page.parent?.type === "database_id" && page.parent?.database_id) {
    // Auto-resolved — the user pasted a page inside a database. Use the parent.
    return page.parent.database_id;
  }

  return rawId; // not inside a database — return original
}

// ---- Main handler ---------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // =====================================================================
    // MODE: List databases (for the settings picker)
    // =====================================================================
    if (body.action === "listDatabases") {
      const user = await loadUser(req);
      if ("error" in user) {
        return new Response(JSON.stringify({ error: user.error }), { status: user.status, headers: corsHeaders });
      }

      // Search for all databases the integration can see
      const searchRes = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: user.notionHeaders,
        body: JSON.stringify({
          filter: { property: "object", value: "database" },
          page_size: 100,
        }),
      });

      if (!searchRes.ok) {
        const errBody = await searchRes.json().catch(() => ({}));
        return new Response(
          JSON.stringify({ error: notionError(searchRes.status, errBody) }),
          { status: 502, headers: corsHeaders }
        );
      }

      const searchJson: any = await searchRes.json();
      const databases = (searchJson.results ?? []).map((db: any) => ({
        id: db.id,
        title: db.title?.[0]?.plain_text ?? db.id,
        url: db.url ?? "",
      }));

      return new Response(JSON.stringify({ databases }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =====================================================================
    // MODE: List pages (for picking a parent for a new database)
    // =====================================================================
    if (body.action === "listPages") {
      const user = await loadUser(req);
      if ("error" in user) {
        return new Response(JSON.stringify({ error: user.error }), { status: user.status, headers: corsHeaders });
      }

      const searchRes = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: user.notionHeaders,
        body: JSON.stringify({
          filter: { property: "object", value: "page" },
          page_size: 100,
        }),
      });

      if (!searchRes.ok) {
        const errBody = await searchRes.json().catch(() => ({}));
        return new Response(
          JSON.stringify({ error: notionError(searchRes.status, errBody) }),
          { status: 502, headers: corsHeaders }
        );
      }

      const searchJson: any = await searchRes.json();
      const pages = (searchJson.results ?? []).map((p: any) => {
        const titleProp = Object.values(p.properties ?? {}).find((prop: any) => prop.type === "title") as any;
        const title = titleProp?.title?.[0]?.plain_text ?? "Untitled";
        return { id: p.id, title, url: p.url };
      });

      return new Response(JSON.stringify({ pages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =====================================================================
    // MODE: Create a new database under a parent page
    // =====================================================================
    if (body.action === "createDatabase") {
      const user = await loadUser(req);
      if ("error" in user) {
        return new Response(JSON.stringify({ error: user.error }), { status: user.status, headers: corsHeaders });
      }

      const { parentPageId, title, categoryName, categoryColor } = body;
      if (!parentPageId || !title) {
        return new Response(
          JSON.stringify({ error: "parentPageId and title are required" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const parsedPageId = parseNotionId(parentPageId);

      const dbRes = await fetch("https://api.notion.com/v1/databases", {
        method: "POST",
        headers: user.notionHeaders,
        body: JSON.stringify({
          parent: { page_id: parsedPageId },
          title: [{ type: "text", text: { content: title } }],
          properties: {
            Name: { title: {} },
            "Due Date": { date: {} },
            Category: {
              select: {
                options: categoryName
                  ? [{ name: categoryName, color: notionSelectColor(categoryColor) }]
                  : [],
              },
            },
            Status: {
              select: {
                options: [
                  { name: "not started", color: "red" },
                  { name: "in progress", color: "yellow" },
                  { name: "done", color: "green" },
                  { name: "carried over", color: "gray" },
                ],
              },
            },
            Importance: { number: { format: "number" } },
            Difficulty: { number: { format: "number" } },
          },
          icon: { type: "emoji", emoji: "📚" },
        }),
      });

      if (!dbRes.ok) {
        const errBody = await dbRes.json().catch(() => ({}));
        return new Response(
          JSON.stringify({ error: notionError(dbRes.status, errBody) }),
          { status: 502, headers: corsHeaders }
        );
      }

      const dbJson: any = await dbRes.json();
      return new Response(
        JSON.stringify({
          id: dbJson.id,
          title: dbJson.title?.[0]?.plain_text ?? title,
          url: dbJson.url,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================================
    // MODE: Sync a task
    // =====================================================================
    const { taskId, schedule: scheduleFlag } = body;
    const schedule = scheduleFlag === true;
    if (!taskId) {
      return new Response(JSON.stringify({ error: "taskId is required" }), { status: 400, headers: corsHeaders });
    }

    const user = await loadUser(req);
    if ("error" in user) {
      return new Response(JSON.stringify({ error: user.error }), { status: user.status, headers: corsHeaders });
    }

    // Load the task (including category-level Notion DB override)
    const { data: task, error: taskErr } = await user.supabase
      .from("tasks")
      .select("*, categories(name, color, notion_database_id)")
      .eq("id", taskId)
      .eq("user_id", user.userId)
      .single();
    if (taskErr || !task) {
      return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers: corsHeaders });
    }

    // Resolve database ID.
    // 1. Prefer the task's class-specific database (for per-class Notion Calendar colors).
    // 2. Fall back to the user's global default database.
    let rawId = task.categories?.notion_database_id as string | undefined;
    let dbSource: 'category' | 'global' = 'category';
    if (!rawId) {
      rawId = user.databaseId;
      dbSource = 'global';
    }
    if (!rawId) {
      return new Response(
        JSON.stringify({ error: "No database ID set. Pick a database in Settings → Notion, or assign one to this class." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const databaseId = await resolveDatabaseId(user.notionHeaders, rawId);

    // Fetch database schema
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, { headers: user.notionHeaders });
    if (!dbRes.ok) {
      const errBody = await dbRes.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          error: notionError(dbRes.status, errBody),
          phase: "fetching database schema",
          resolvedId: databaseId !== rawId ? databaseId : undefined,
        }),
        { status: 502, headers: corsHeaders }
      );
    }

    const dbSchema = await dbRes.json();
    const dbProps: NotionProp[] = Object.entries(dbSchema.properties ?? {}).map(
      ([key, val]: [string, any]) => ({ id: key, name: val.name ?? key, type: val.type ?? "unknown" })
    );

    if (dbProps.length === 0 || !dbProps.some((p) => p.type === "title")) {
      return new Response(
        JSON.stringify({ error: "This database has no Title property. Add a title column in Notion." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Build properties
    const { properties, titlePropName } = buildProperties(task, dbProps, { schedule });

    // If the database was auto-resolved, save the corrected ID back.
    // For class-specific DBs, save to categories; for global DB, save to user_settings.
    if (databaseId !== rawId) {
      if (dbSource === 'category' && task.categories?.notion_database_id) {
        await user.supabase.from("categories")
          .update({ notion_database_id: databaseId })
          .eq("id", task.category_id);
      } else {
        await user.supabase.from("user_settings")
          .update({ notion_database_id: databaseId })
          .eq("user_id", user.userId);
      }
    }

    // Create or update the Notion page
    let notionResponse: Response;
    let pageId = task.notion_page_id as string | null;

    async function createPage() {
      return fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: user.notionHeaders,
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties,
          icon: pageIcon(task),
        }),
      });
    }

    if (pageId) {
      notionResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "PATCH",
        headers: user.notionHeaders,
        body: JSON.stringify({ properties }),
      });
      if (notionResponse.status === 404) {
        pageId = null;
        notionResponse = await createPage();
      }
    } else {
      notionResponse = await createPage();
    }

    const notionJson = await notionResponse.json();
    if (!notionResponse.ok) {
      return new Response(
        JSON.stringify({
          error: notionError(notionResponse.status, notionJson),
          phase: pageId ? "updating page" : "creating page",
          mappedProperties: Object.keys(properties),
          databaseProperties: dbProps.map((p) => `${p.name} (${p.type})`),
          databaseId,
        }),
        { status: 502, headers: corsHeaders }
      );
    }

    pageId = notionJson.id;
    await user.supabase.from("tasks").update({ notion_page_id: pageId }).eq("id", taskId);

    // Build a Notion Calendar deep link to the page's date so the user can
    // jump straight to the right week in Notion Calendar. When the task is
    // not being scheduled, just link to the calendar root.
    const calendarDate = task.due_date ?? new Date().toISOString().slice(0, 10);
    const calendarDeepLink = schedule
      ? `https://calendar.notion.so/${calendarDate.replace(/-/g, '')}`
      : 'https://calendar.notion.so/';

    return new Response(
      JSON.stringify({
        ok: true,
        notionPageId: pageId,
        titlePropName,
        databaseId,
        autoResolved: databaseId !== rawId,
        calendarDeepLink,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
