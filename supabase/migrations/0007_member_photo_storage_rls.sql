grant update (photo_url) on public.profiles to authenticated;

drop policy if exists member_photo_owner_manage on storage.objects;
drop policy if exists member_photo_owner_read on storage.objects;
drop policy if exists member_photo_owner_insert on storage.objects;
drop policy if exists member_photo_owner_update on storage.objects;
drop policy if exists member_photo_owner_delete on storage.objects;

create policy member_photo_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy member_photo_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.public_listing = true
        and p.visibility->>'photo' = 'public'
    ));

create policy member_photo_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.public_listing = true
        and p.visibility->>'photo' = 'public'
    ));

create policy member_photo_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text);