import { supabase } from './supabase';

export async function sendTaskToNotion(
  taskId: string,
  opts?: { schedule?: boolean }
): Promise<{ ok: boolean; notionPageId?: string; calendarDeepLink?: string; error?: string }> {
  // Race the invoke against a 20-second timeout so the UI never hangs.
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<{ __timedOut: true }>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Request timed out')), 20000);
  });

  try {
    const result = await Promise.race([
      supabase.functions.invoke('notion-sync', { body: { taskId, schedule: opts?.schedule } }),
      timeout,
    ]);
    // Narrow: timeout resolves never, so result is always the invoke response
    const { data, error } = result as { data: any; error: any };
    if (error) {
      // supabase-js surfaces non-2xx responses as FunctionsHttpError; the body
      // is on error.context. Our edge function returns { error, phase,
      // mappedProperties, databaseProperties, details }.
      const ctx = (error as any)?.context ?? {};
      let message = ctx?.error ?? error?.message ?? 'Unknown error';
      // Append Notion's raw error detail
      const detail = ctx?.details?.message ?? ctx?.details?.code ?? '';
      if (detail) message += `

${detail}`;
      // Append diagnostic info so the user can see what was mapped
      if (ctx?.mappedProperties?.length) {
        message += `

Mapped: ${ctx.mappedProperties.join(', ')}`;
      }
      if (ctx?.databaseProperties?.length) {
        message += `

Your database has: ${ctx.databaseProperties.join(', ')}`;
      }
      return { ok: false, error: message };
    }
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true, notionPageId: data?.notionPageId, calendarDeepLink: data?.calendarDeepLink };
  } finally {
    clearTimeout(timeoutId!);
  }
}

export async function listNotionDatabases(): Promise<{ databases?: { id: string; title: string; url: string }[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke('notion-sync', {
    body: { action: 'listDatabases' },
  });
  if (error) {
    const ctx = (error as any)?.context ?? {};
    return { error: ctx?.error ?? error?.message ?? 'Failed to list databases' };
  }
  if (data?.error) return { error: data.error };
  return { databases: data?.databases ?? [] };
}

export async function listNotionPages(): Promise<{ pages?: { id: string; title: string; url: string }[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke('notion-sync', {
    body: { action: 'listPages' },
  });
  if (error) {
    const ctx = (error as any)?.context ?? {};
    return { error: ctx?.error ?? error?.message ?? 'Failed to list pages' };
  }
  if (data?.error) return { error: data.error };
  return { pages: data?.pages ?? [] };
}

export async function createNotionDatabase(
  parentPageId: string,
  title: string,
  categoryName: string,
  categoryColor: string
): Promise<{ database?: { id: string; title: string; url: string }; error?: string }> {
  const { data, error } = await supabase.functions.invoke('notion-sync', {
    body: { action: 'createDatabase', parentPageId, title, categoryName, categoryColor },
  });
  if (error) {
    const ctx = (error as any)?.context ?? {};
    return { error: ctx?.error ?? error?.message ?? 'Failed to create database' };
  }
  if (data?.error) return { error: data.error };
  return { database: { id: data.id, title: data.title, url: data.url } };
}

// Standard OAuth authorization-code flow against Notion's own endpoints —
// used by the Settings screen's "Connect Notion" button. Requires a Notion
// public integration (created at notion.so/my-integrations) with this
// redirect URI registered. The callback lands on a Supabase edge function
// (notion-oauth-callback) that exchanges the code and writes the token to
// user_settings, then deep-links back into the app via the orgnz:// scheme.
export function buildNotionAuthUrl(clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    owner: 'user',
    state,
  });
  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}
