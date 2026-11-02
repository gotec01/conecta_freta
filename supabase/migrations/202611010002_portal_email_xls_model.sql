-- Configure email delivery for portals and store a private XLS/XLSX template.
alter table public.organization_portals
  add column if not exists delivery_method text not null default 'portal',
  add column if not exists delivery_email text,
  add column if not exists email_template_path text,
  add column if not exists email_template_name text,
  add column if not exists email_template_sheet text;
alter table public.organization_portals drop constraint if exists organization_portals_delivery_method_check;
alter table public.organization_portals add constraint organization_portals_delivery_method_check check (delivery_method in ('portal', 'email'));

create or replace function public.update_organization_portal_configuration(
  p_organization_id uuid, p_old_portal text, p_name text, p_url text, p_description text,
  p_delivery_method text, p_delivery_email text, p_email_template_path text, p_email_template_name text, p_email_template_sheet text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_org_member(p_organization_id) then raise exception 'Not authorized to edit this organization portal' using errcode = '42501'; end if;
  if p_delivery_method not in ('portal', 'email') then raise exception 'Invalid portal delivery method' using errcode = '22023'; end if;
  if p_delivery_method = 'email' and nullif(trim(p_delivery_email), '') is null then raise exception 'A destination email is required for email delivery' using errcode = '22023'; end if;
  perform public.update_organization_portal_details(p_organization_id, p_old_portal, p_name, p_url, p_description);
  update public.organization_portals set
    delivery_method = p_delivery_method,
    delivery_email = case when p_delivery_method = 'email' then trim(p_delivery_email) else null end,
    email_template_path = case when p_delivery_method = 'email' then p_email_template_path else null end,
    email_template_name = case when p_delivery_method = 'email' then nullif(trim(p_email_template_name), '') else null end,
    email_template_sheet = case when p_delivery_method = 'email' then nullif(trim(p_email_template_sheet), '') else null end,
    updated_at = now()
  where organization_id = p_organization_id and portal = trim(p_name);
  if not found then raise exception 'Portal not found after update' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.update_organization_portal_configuration(uuid, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_organization_portal_configuration(uuid, text, text, text, text, text, text, text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-email-templates', 'portal-email-templates', false, 10485760, array['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization members can view portal email templates" on storage.objects;
create policy "Organization members can view portal email templates" on storage.objects for select to authenticated using (bucket_id = 'portal-email-templates' and public.is_org_member((storage.foldername(name))[1]::uuid));
drop policy if exists "Organization members can upload portal email templates" on storage.objects;
create policy "Organization members can upload portal email templates" on storage.objects for insert to authenticated with check (bucket_id = 'portal-email-templates' and public.is_org_member((storage.foldername(name))[1]::uuid));
drop policy if exists "Organization members can delete portal email templates" on storage.objects;
create policy "Organization members can delete portal email templates" on storage.objects for delete to authenticated using (bucket_id = 'portal-email-templates' and public.is_org_member((storage.foldername(name))[1]::uuid));
