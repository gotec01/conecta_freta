-- Email recipients and reusable notification template for each client.
alter table public.clients
  add column if not exists notification_recipients text[] not null default '{}',
  add column if not exists notification_cc text[] not null default '{}',
  add column if not exists notification_subject text not null default '',
  add column if not exists notification_body text not null default '';

-- Existing client RLS policies already limit reads and updates to organization members.
grant select, update on public.clients to authenticated;
