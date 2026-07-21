import { supabase } from './supabase';

export type Category = {
  id: string;
  user_id: string;
  name: string;
  kind: 'class' | 'club' | 'research' | 'other';
  color: string;
  notion_database_id: string | null;
};

export type Task = {
  id: string;
  user_id: string;
  category_id: string | null;
  title: string;
  notes: string | null;
  due_date: string | null;
  importance: number;
  difficulty: number;
  estimated_minutes: number | null;
  status: 'not_started' | 'in_progress' | 'done' | 'carried_over';
  notion_page_id: string | null;
  categories?: { name: string; color: string } | null;
};

export type TaskEvent = {
  id: string;
  task_id: string;
  event_type: 'created' | 'started' | 'completed' | 'missed' | 'rescheduled' | 'carried_over';
  event_time: string;
  scheduled_time: string | null;
  completed_time: string | null;
  difficulty: number | null;
  importance: number | null;
  category_id: string | null;
};

export type Deliverable = {
  id: string;
  task_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type Event = {
  id: string;
  user_id: string;
  category_id: string | null;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  categories?: { name: string; color: string } | null;
};

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not authenticated');
  return data.user.id;
}

// ---------------- categories ----------------
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(input: { name: string; kind: Category['kind']; color: string; notion_database_id?: string | null }) {
  const user_id = await currentUserId();
  const { data, error } = await supabase.from('categories').insert({ ...input, user_id }).select().single();
  if (error) throw error;
  return data as Category;
}

export async function updateCategory(categoryId: string, patch: Partial<Category>) {
  const { data, error } = await supabase.from('categories').update(patch).eq('id', categoryId).select().single();
  if (error) throw error;
  return data as Category;
}

// ---------------- class_blocks ----------------
export async function listClassBlocks(categoryId?: string) {
  let q = supabase.from('class_blocks').select('*, class_block_exceptions(*)');
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createClassBlock(input: {
  category_id: string;
  label: string;
  location?: string;
  start_time: string;
  end_time: string;
  dtstart: string;
  rrule: string;
}) {
  const user_id = await currentUserId();
  // conflict check against existing blocks in the same time-of-day window
  const { data: conflicts } = await supabase.rpc('overlapping_blocks', {
    p_user_id: user_id,
    p_start: input.start_time,
    p_end: input.end_time,
  });
  const { data, error } = await supabase.from('class_blocks').insert({ ...input, user_id }).select().single();
  if (error) throw error;
  return { block: data, conflicts: conflicts ?? [] };
}

// ---------------- tasks ----------------
export async function listTasks(opts?: { categoryId?: string }): Promise<Task[]> {
  let q = supabase.from('tasks').select('*, categories(name, color)').order('due_date', { ascending: true });
  if (opts?.categoryId) q = q.eq('category_id', opts.categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Task[];
}

export async function createTask(input: {
  title: string;
  category_id?: string | null;
  due_date?: string | null;
  importance: number;
  difficulty: number;
  estimated_minutes?: number | null;
  notes?: string | null;
}) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...input, user_id, status: 'not_started' })
    .select()
    .single();
  if (error) throw error;

  await logTaskEvent(data.id, 'created', { difficulty: data.difficulty, importance: data.importance, category_id: data.category_id });
  return data as Task;
}

export async function setTaskStatus(taskId: string, status: Task['status']) {
  const user_id = await currentUserId();
  const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).single();

  const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
  if (error) throw error;

  const eventType =
    status === 'done' ? 'completed' : status === 'carried_over' ? 'carried_over' : status === 'in_progress' ? 'started' : 'rescheduled';
  await logTaskEvent(taskId, eventType, {
    difficulty: task?.difficulty,
    importance: task?.importance,
    category_id: task?.category_id,
    completed_time: status === 'done' ? new Date().toISOString() : undefined,
    scheduled_time: task?.due_date ? new Date(task.due_date).toISOString() : undefined,
  });
  void user_id;
}

export async function updateTask(taskId: string, patch: Partial<Task>) {
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', taskId).select().single();
  if (error) throw error;
  return data as Task;
}

// End-of-day carry-over: bulk-moves every unfinished task due today to tomorrow.
export async function carryOverUnfinished(dateStr: string) {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('due_date', dateStr)
    .neq('status', 'done');
  if (error) throw error;

  const tomorrow = new Date(dateStr);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  for (const t of tasks ?? []) {
    await supabase.from('tasks').update({ due_date: tomorrowStr, status: 'carried_over' }).eq('id', t.id);
    await logTaskEvent(t.id, 'carried_over', {});
  }
  return (tasks ?? []).length;
}

async function logTaskEvent(
  taskId: string,
  eventType: TaskEvent['event_type'],
  extra: { difficulty?: number | null; importance?: number | null; category_id?: string | null; scheduled_time?: string; completed_time?: string }
) {
  const user_id = await currentUserId();
  await supabase.from('task_events').insert({
    user_id,
    task_id: taskId,
    event_type: eventType,
    ...extra,
  });
}

export async function listTaskEvents(sinceDaysAgo = 90): Promise<TaskEvent[]> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDaysAgo);
  const { data, error } = await supabase
    .from('task_events')
    .select('*')
    .gte('event_time', since.toISOString())
    .order('event_time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ---------------- events (one-off: tests, application deadlines) ----------------
export async function listEvents(opts?: { categoryId?: string; from?: string; to?: string }): Promise<Event[]> {
  let q = supabase.from('events').select('*, categories(name, color)').order('event_date', { ascending: true });
  if (opts?.categoryId) q = q.eq('category_id', opts.categoryId);
  if (opts?.from) q = q.gte('event_date', opts.from);
  if (opts?.to) q = q.lte('event_date', opts.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Event[];
}

export async function createEvent(input: {
  title: string;
  category_id?: string | null;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  notes?: string | null;
}) {
  const user_id = await currentUserId();
  const { data, error } = await supabase.from('events').insert({ ...input, user_id }).select().single();
  if (error) throw error;
  return data as Event;
}

export async function updateEvent(eventId: string, patch: Partial<Event>) {
  const { data, error } = await supabase.from('events').update(patch).eq('id', eventId).select().single();
  if (error) throw error;
  return data as Event;
}

export async function deleteEvent(eventId: string) {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

// ---------------- deliverables ----------------
export async function listDeliverables(taskId: string): Promise<Deliverable[]> {
  const { data, error } = await supabase
    .from('deliverables')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listDeliverablesForCategory(categoryId: string) {
  const { data, error } = await supabase
    .from('deliverables')
    .select('*, tasks!inner(title, due_date, category_id)')
    .eq('tasks.category_id', categoryId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type DeliverableWithTask = Deliverable & {
  tasks: {
    title: string;
    due_date: string | null;
    category_id: string | null;
    categories: { name: string; color: string } | null;
  } | null;
};

export async function listAllDeliverables(): Promise<DeliverableWithTask[]> {
  const { data, error } = await supabase
    .from('deliverables')
    .select('*, tasks!inner(title, due_date, category_id, categories(name, color))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DeliverableWithTask[];
}

export async function uploadDeliverable(taskId: string, fileName: string, bytes: Uint8Array, mimeType: string) {
  const user_id = await currentUserId();
  const storagePath = `${user_id}/${taskId}/${Date.now()}-${fileName}`;

  const { error: uploadErr } = await supabase.storage.from('deliverables').upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadErr) throw uploadErr;

  const { data, error } = await supabase
    .from('deliverables')
    .insert({
      user_id,
      task_id: taskId,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: bytes.byteLength,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Deliverable;
}

export async function deleteDeliverable(id: string, storagePath: string) {
  await supabase.storage.from('deliverables').remove([storagePath]);
  const { error } = await supabase.from('deliverables').delete().eq('id', id);
  if (error) throw error;
}

export async function getDeliverableSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from('deliverables').createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------- smart input recognition ----------------
// Fuzzy-matches the in-progress title against past task titles via the
// pg_trgm similarity() function (see fuzzy_match_tasks in migration 0003),
// returning the closest past task so the UI can prefill category/importance/difficulty.
export async function suggestFromSimilarTasks(partialTitle: string): Promise<Task | null> {
  if (partialTitle.trim().length < 3) return null;
  const { data, error } = await supabase.rpc('fuzzy_match_tasks', {
    p_query: partialTitle.trim(),
    p_limit: 1,
  });
  if (error || !data?.length) return null;
  const row = data[0];
  return {
    id: row.id,
    user_id: '',
    category_id: row.category_id,
    title: row.title,
    notes: null,
    due_date: null,
    importance: row.importance,
    difficulty: row.difficulty,
    estimated_minutes: null,
    status: 'not_started',
    notion_page_id: null,
    categories: row.category_name ? { name: row.category_name, color: row.category_color } : null,
  };
}
