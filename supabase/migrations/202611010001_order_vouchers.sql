-- Private delivery vouchers attached to each order.
alter table public.orders
  add column if not exists voucher_path text,
  add column if not exists voucher_file_name text,
  add column if not exists voucher_content_type text
    check (voucher_content_type is null or voucher_content_type in ('application/pdf', 'image/jpeg'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-vouchers', 'order-vouchers', false, 10485760, array['application/pdf', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization members can view order vouchers" on storage.objects;
create policy "Organization members can view order vouchers" on storage.objects
for select to authenticated using (
  bucket_id = 'order-vouchers' and exists (
    select 1 from public.orders o
    where o.id::text = (storage.foldername(name))[2]
      and o.organization_id::text = (storage.foldername(name))[1]
      and public.is_org_member(o.organization_id)
  )
);

drop policy if exists "Organization members can upload order vouchers" on storage.objects;
create policy "Organization members can upload order vouchers" on storage.objects
for insert to authenticated with check (
  bucket_id = 'order-vouchers' and exists (
    select 1 from public.orders o
    where o.id::text = (storage.foldername(name))[2]
      and o.organization_id::text = (storage.foldername(name))[1]
      and public.is_org_member(o.organization_id)
  )
);

drop policy if exists "Organization members can delete order vouchers" on storage.objects;
create policy "Organization members can delete order vouchers" on storage.objects
for delete to authenticated using (
  bucket_id = 'order-vouchers' and exists (
    select 1 from public.orders o
    where o.id::text = (storage.foldername(name))[2]
      and o.organization_id::text = (storage.foldername(name))[1]
      and public.is_org_member(o.organization_id)
  )
);
