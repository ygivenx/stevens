create schema if not exists crm;
create table if not exists crm.people (id text primary key, name text not null, title text not null, db_role name not null unique);
create table if not exists crm.deals (id text primary key, company text not null, sector text not null, stage text not null, ask_usd bigint, updated_at timestamptz not null default now());
create table if not exists crm.meetings (id text primary key, deal_id text not null references crm.deals(id), title text not null, starts_at timestamptz not null, updated_at timestamptz not null default now());
create table if not exists crm.documents (id text primary key, deal_id text references crm.deals(id), kind text not null, title text not null, created_at timestamptz not null, updated_at timestamptz not null default now());
create table if not exists crm.document_bodies (document_id text primary key references crm.documents(id) on delete cascade, body text, media_path text);
create table if not exists crm.document_grants (document_id text not null references crm.documents(id) on delete cascade, grantee name not null, primary key (document_id, grantee));
create table if not exists crm.portfolio (company text primary key, sector text not null);

alter table crm.document_bodies enable row level security;
drop policy if exists read_when_granted on crm.document_bodies;
create policy read_when_granted on crm.document_bodies for select using (
  exists (select 1 from crm.document_grants g
          where g.document_id = document_bodies.document_id and pg_has_role(current_user, g.grantee, 'member'))
  and not exists (select 1 from crm.document_grants h
          where h.document_id = document_bodies.document_id and h.grantee like 'dh\_legal\_hold\_%'
            and not pg_has_role(current_user, h.grantee, 'member'))
);

grant usage on schema crm to dh_all_staff, dh_stevens;
grant select on all tables in schema crm to dh_all_staff, dh_stevens;
