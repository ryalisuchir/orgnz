-- Trigram similarity search over the current user's past tasks.
-- Used by lib/data.ts#suggestFromSimilarTasks to prefill category/importance/
-- difficulty as the user types a new task title.
create or replace function fuzzy_match_tasks(p_query text, p_limit int default 5)
returns table (
  id uuid,
  title text,
  category_id uuid,
  category_name text,
  category_color text,
  importance smallint,
  difficulty smallint,
  similarity real
) as $$
  select
    t.id, t.title, t.category_id, c.name as category_name, c.color as category_color,
    t.importance, t.difficulty,
    similarity(t.title, p_query) as similarity
  from tasks t
  left join categories c on c.id = t.category_id
  where t.user_id = auth.uid()
    and t.title % p_query
  order by similarity desc, t.created_at desc
  limit p_limit;
$$ language sql stable security definer
set search_path = public, extensions, pg_temp;

-- Fuzzy search over deliverable file names + their parent task titles,
-- scoped to one category. Powers the "find a past submission" search.
create or replace function fuzzy_match_deliverables(p_category_id uuid, p_query text, p_limit int default 20)
returns table (
  id uuid,
  file_name text,
  storage_path text,
  task_id uuid,
  task_title text,
  due_date date,
  similarity real
) as $$
  select
    d.id, d.file_name, d.storage_path, d.task_id, t.title as task_title, t.due_date,
    greatest(similarity(d.file_name, p_query), similarity(t.title, p_query)) as similarity
  from deliverables d
  join tasks t on t.id = d.task_id
  where d.user_id = auth.uid()
    and t.category_id = p_category_id
    and (d.file_name % p_query or t.title % p_query)
  order by similarity desc
  limit p_limit;
$$ language sql stable security definer
set search_path = public, extensions, pg_temp;
