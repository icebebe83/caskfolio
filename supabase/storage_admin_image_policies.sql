-- Admin image upload policies for Supabase Storage.
-- Run this in the Supabase SQL Editor when Admin bottle master image or
-- homepage banner uploads fail with "new row violates row-level security policy".

drop policy if exists "admin_image_select_caskindex_images" on storage.objects;
create policy "admin_image_select_caskindex_images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'caskindex-images'
  and public.is_admin()
  and (storage.foldername(name))[1] in ('bottles', 'site-content')
);

drop policy if exists "admin_image_upload_caskindex_images" on storage.objects;
create policy "admin_image_upload_caskindex_images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'caskindex-images'
  and public.is_admin()
  and (storage.foldername(name))[1] in ('bottles', 'site-content')
);

drop policy if exists "admin_image_update_caskindex_images" on storage.objects;
create policy "admin_image_update_caskindex_images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'caskindex-images'
  and public.is_admin()
  and (storage.foldername(name))[1] in ('bottles', 'site-content')
)
with check (
  bucket_id = 'caskindex-images'
  and public.is_admin()
  and (storage.foldername(name))[1] in ('bottles', 'site-content')
);

drop policy if exists "admin_image_delete_caskindex_images" on storage.objects;
create policy "admin_image_delete_caskindex_images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'caskindex-images'
  and public.is_admin()
  and (storage.foldername(name))[1] in ('bottles', 'site-content')
);
