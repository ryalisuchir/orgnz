-- orgnz core schema
--
-- Note: Supabase installs extensions into a dedicated `extensions` schema,
-- not `public`. Creating pg_trgm without a schema clause (or relying on
-- unqualified search_path) is a common source of "function/operator does
-- not exist" errors on `supabase db push` even though the extension shows
-- as installed — so we're explicit here. UUIDs use the core
-- gen_random_uuid() (built into Postgres since v13) instead of uuid-ossp,
-- which sidesteps the same class of problem entirely.
create extension if not exists pg_trgm with schema extensions;
set search_path = public, extensions;

-- ============= categories =============
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('class','club','research','other')),
  color text not null default '#6C63FF',
  created_at timestamptz not null default now()
);
create index categories_user_idx on categories(user_id);

-- ============= class_blocks (recurring meeting times) =============
create table class_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  label text,
  location text,
  start_time time not null,
  end_time time not null,
  dtstart date not null,          -- first occurrence date, anchors the RRULE
  rrule text not null,            -- RFC5545 RRULE string, e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR
  created_at timestamptz not null default now()
);
create index class_blocks_user_idx on class_blocks(user_id);
create index class_blocks_category_idx on class_blocks(category_id);

-- one-off exceptions to a recurring block (prof reschedules/cancels a class)
create table class_block_exceptions (
  id uuid primary key default gen_random_uuid(),
  class_block_id uuid not null references class_blocks(id) on delete cascade,
  exception_date date not null,          -- original date being overridden
  is_cancelled boolean not null default false,
  override_start_time time,
  override_end_time time,
  override_location text,
  note text,
  unique (class_block_id, exception_date)
);

-- ============= tasks =============
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  title text not null,
  notes text,
  due_date date,
  importance smallint not null default 3 check (importance between 1 and 5),
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  estimated_minutes int,
  status text not null default 'not_started' check (status in ('not_started','in_progress','done','carried_over')),
  notion_page_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_idx on tasks(user_id);
create index tasks_category_idx on tasks(category_id);
create index tasks_due_date_idx on tasks(due_date);
-- trigram index powers fuzzy "smart input recognition" search on title
create index tasks_title_trgm_idx on tasks using gin (title extensions.gin_trgm_ops);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ============= events (one-off: tests, application deadlines) =============
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  notes text,
  created_at timestamptz not null default now()
);
create index events_user_idx on events(user_id);
create index events_date_idx on events(event_date);

-- ============= task_events (append-only productivity log) =============
create table task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  event_type text not null check (event_type in ('created','started','completed','missed','rescheduled','carried_over')),
  event_time timestamptz not null default now(),   -- when this log entry happened
  scheduled_time timestamptz,                       -- when the task was planned for, if known
  completed_time timestamptz,                       -- when it was actually finished, if this is a completion
  difficulty smallint,                               -- snapshot of task difficulty at event time (denormalized for fast analytics)
  importance smallint,
  category_id uuid references categories(id) on delete set null
);
create index task_events_user_idx on task_events(user_id);
create index task_events_task_idx on task_events(task_id);
create index task_events_time_idx on task_events(event_time);

-- ============= deliverables (Supabase Storage attachments) =============
create table deliverables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index deliverables_task_idx on deliverables(task_id);
create index deliverables_user_idx on deliverables(user_id);

-- ============= user_settings =============
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notion_access_token text,
  notion_database_id text,
  morning_digest_time time not null default '07:30',
  morning_digest_enabled boolean not null default true,
  timezone text not null default 'America/Chicago',
  face_id_lock boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on user_settings
  for each row execute function set_updated_at();

-- ============= push tokens (for expo-notifications) =============
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  device_label text,
  created_at timestamptz not null default now()
);

-- ================= Row Level Security =================
alter table categories enable row level security;
alter table class_blocks enable row level security;
alter table class_block_exceptions enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table task_events enable row level security;
alter table deliverables enable row level security;
alter table user_settings enable row level security;
alter table push_tokens enable row level security;

-- Standard "owns the row" policy, repeated per table.
create policy "own rows" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on class_blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows via block" on class_block_exceptions for all
  using (exists (select 1 from class_blocks b where b.id = class_block_id and b.user_id = auth.uid()))
  with check (exists (select 1 from class_blocks b where b.id = class_block_id and b.user_id = auth.uid()));
create policy "own rows" on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on task_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on deliverables for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on push_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ================= Conflict detection helper =================
-- Returns overlapping class_blocks for a user on the same weekday pattern window.
-- App calls this (or does the equivalent client-side with rrule.js) before saving a new block.
create or replace function overlapping_blocks(p_user_id uuid, p_start time, p_end time, p_exclude_id uuid default null)
returns setof class_blocks as $$
  select * from class_blocks
  where user_id = p_user_id
    and (p_exclude_id is null or id <> p_exclude_id)
    and start_time < p_end
    and end_time > p_start;
$$ language sql stable;
