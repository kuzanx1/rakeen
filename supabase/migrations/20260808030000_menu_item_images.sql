-- Product photo upload existed in the dashboard UI but was never wired to
-- persistence: the picked file only lived in client-side modal state and
-- was silently dropped from the save payload — nothing was ever uploaded
-- to storage or written to menu_items, so nothing could reach the POS.
alter table menu_items add column image_url text;

insert into storage.buckets (id, name, public)
values ('menu-item-images', 'menu-item-images', true)
on conflict (id) do nothing;

create policy "menu item images public read" on storage.objects for select
  using (bucket_id = 'menu-item-images');
create policy "menu item images owner insert" on storage.objects for insert
  with check (bucket_id = 'menu-item-images' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:menu'));
create policy "menu item images owner update" on storage.objects for update
  using (bucket_id = 'menu-item-images' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:menu'))
  with check (bucket_id = 'menu-item-images' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:menu'));
create policy "menu item images owner delete" on storage.objects for delete
  using (bucket_id = 'menu-item-images' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:menu'));
