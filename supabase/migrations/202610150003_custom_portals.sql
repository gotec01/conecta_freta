-- Allow each organization to maintain its own catalog of portals.
alter table public.orders drop constraint if exists orders_portal_check;
alter table public.organization_portals drop constraint if exists organization_portals_portal_check;
alter table public.portal_credentials drop constraint if exists portal_credentials_portal_check;

alter table public.organization_portals add column if not exists portal_url text;
alter table public.organization_portals add column if not exists description text not null default '';

update public.organization_portals
set portal_url = case portal
  when 'TempoCerto' then 'https://tempocerto.com/'
  when 'Trizy' then 'https://www.trizy.com.br/'
  when 'Nexello' then 'https://portal.nexello.com.br/'
  else 'https://example.com/'
end,
description = case portal
  when 'TempoCerto' then 'Agendamento de cargas'
  when 'Trizy' then 'Gestão logística'
  when 'Nexello' then 'Portal de agendamentos'
  else coalesce(nullif(description, ''), 'Portal cadastrado pela empresa')
end
where portal_url is null or description = '';

alter table public.organization_portals alter column portal_url set not null;
alter table public.organization_portals add constraint organization_portals_url_http_check check (portal_url ~* '^https?://');
alter table public.organization_portals add constraint organization_portals_name_length_check check (length(trim(portal)) between 1 and 60);
alter table public.orders add constraint orders_portal_name_length_check check (length(trim(portal)) between 1 and 60);
alter table public.portal_credentials add constraint portal_credentials_name_length_check check (length(trim(portal)) between 1 and 60);

-- New users still receive the three starter portals, now with their portal URLs.
create or replace function public.create_personal_organization()
returns trigger language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  insert into public.organizations (name) values (coalesce(nullif(split_part(new.email, '@', 1), ''), 'Minha empresa')) returning id into org_id;
  insert into public.organization_members (organization_id, user_id, role) values (org_id, new.id, 'owner');
  insert into public.organization_portals (organization_id, portal, portal_url, description, active) values
    (org_id, 'TempoCerto', 'https://tempocerto.com/', 'Agendamento de cargas', true),
    (org_id, 'Trizy', 'https://www.trizy.com.br/', 'Gestão logística', true),
    (org_id, 'Nexello', 'https://portal.nexello.com.br/', 'Portal de agendamentos', true);
  return new;
end;
$$;
