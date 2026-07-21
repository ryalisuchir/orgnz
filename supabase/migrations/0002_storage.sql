-- Storage bucket for deliverables. Files are stored at: {user_id}/{task_id}/{filename}
insert into storage.buckets (id, name, public)
values ('deliverables', 'deliverables', false)
on conflict (id) do nothing;

create policy "deliverables: user reads own files"
on storage.objects for select
using (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "deliverables: user uploads own files"
on storage.objects for insert
with check (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "deliverables: user deletes own files"
on storage.objects for delete
using (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);
