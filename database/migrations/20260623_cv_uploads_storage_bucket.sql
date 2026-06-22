-- BUG-2 real fix (2026-06-23): resumable, direct-to-storage CV upload (Google Drive model).
-- The whole-file multipart POST through the FastAPI app server fails 65% on lossy mobile
-- links (613ms median fast-fail, 5 users hard-blocked). Move the bytes off the app server:
-- the browser uploads the CV straight to this private bucket via Supabase's native resumable
-- (TUS) endpoint; the backend then downloads the object in POST /cv/upload/finalize.
--
-- Path convention: cv-uploads/{auth_user_id}/{idempotency_key}.{pdf|docx}
-- RLS: an authenticated user may only touch objects under their own {user_id}/ prefix.
-- The backend reads/deletes via the service-role admin client (bypasses RLS).
--
-- Manual-apply (Supabase migrations are not auto-run). After applying: NOTIFY pgrst,'reload schema'.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv-uploads',
  'cv-uploads',
  false,
  10485760, -- 10MB, matches backend MAX_FILE_BYTES
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Own-folder-only access for the resumable upload (TUS uses POST + PATCH → insert/update,
-- and HEAD → select to resume from the last acked offset).
create policy "cv_uploads_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cv-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cv_uploads_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'cv-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cv_uploads_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'cv-uploads' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cv-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cv_uploads_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cv-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
