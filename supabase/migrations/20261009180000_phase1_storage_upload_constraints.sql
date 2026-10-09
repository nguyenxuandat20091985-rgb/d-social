begin;

-- Enforce server-side upload constraints aligned with the app's 8 MB image / 30 MB video limits.
-- Include common iOS HEIC/HEIF photo MIME types as well as standard web image/video formats.
update storage.buckets
set file_size_limit = 33554432,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif',
      'video/mp4','video/webm','video/quicktime'
    ]::text[]
where id = 'social-media';

-- Media posts live under <user-id>/..., while avatars live under avatars/<user-id>/...
-- Keep all writes scoped to the authenticated user's own folder in either layout.
drop policy if exists social_media_insert on storage.objects;
create policy social_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'social-media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (
      (storage.foldername(name))[1] = 'avatars'
      and (storage.foldername(name))[2] = (select auth.uid())::text
    )
  )
);

drop policy if exists social_media_update on storage.objects;
create policy social_media_update on storage.objects
for update to authenticated
using (
  bucket_id = 'social-media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (
      (storage.foldername(name))[1] = 'avatars'
      and (storage.foldername(name))[2] = (select auth.uid())::text
    )
  )
)
with check (
  bucket_id = 'social-media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (
      (storage.foldername(name))[1] = 'avatars'
      and (storage.foldername(name))[2] = (select auth.uid())::text
    )
  )
);

drop policy if exists social_media_delete on storage.objects;
create policy social_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'social-media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (
      (storage.foldername(name))[1] = 'avatars'
      and (storage.foldername(name))[2] = (select auth.uid())::text
    )
  )
);

commit;
