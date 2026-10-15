-- Store portal login credentials encrypted by the application server.
create table if not exists public.portal_credentials (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portal text not null check (portal in ('TempoCerto', 'Trizy', 'Nexello')),
  username_ciphertext text not null,
  password_ciphertext text not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, portal)
);

alter table public.portal_credentials enable row level security;
drop policy if exists "Members can read portal credential records" on public.portal_credentials;
drop policy if exists "Members can add portal credential records" on public.portal_credentials;
drop policy if exists "Members can update portal credential records" on public.portal_credentials;
revoke all on public.portal_credentials from anon, authenticated;
grant all on public.portal_credentials to service_role;
