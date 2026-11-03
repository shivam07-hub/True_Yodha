-- Instagram's publishing API fetches every carousel slide from a public URL, and
-- it reads JPEG only. The Distribution Tracker uploads the slides here when an
-- operator presses Publish, then hands Instagram these URLs.
--
-- Public read, JPEG only, 8 MB a file. No policies: only the backend's service
-- key writes, so nothing a signed-in user holds can upload or delete here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('growth-media', 'growth-media', true, 8388608, array['image/jpeg'])
on conflict (id) do nothing;
