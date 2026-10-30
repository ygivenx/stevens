create table if not exists people (
  id text primary key,
  name text not null,
  role text not null,
  agent_token_sha256 text
);
create table if not exists deals (
  id text primary key,
  company text not null,
  sector text not null,
  stage text not null,
  ask_usd bigint
);
create table if not exists deal_team (
  deal_id text not null references deals(id),
  person_id text not null references people(id),
  primary key (deal_id, person_id)
);
create table if not exists meetings (
  id text primary key,
  deal_id text not null references deals(id),
  title text not null,
  starts_at text not null,
  ask_hint text
);
create table if not exists documents (
  id text primary key,
  connector text not null,
  deal_id text references deals(id),
  kind text not null,
  title text not null,
  body text,
  media_path text,
  created_at text not null,
  shared_by text references people(id)
);
create table if not exists document_acl (
  document_id text not null references documents(id),
  principal text not null,
  primary key (document_id, principal)
);
create table if not exists portfolio (
  company text primary key,
  sector text not null
);
create table if not exists filings (
  accession text primary key,
  issuer text not null,
  cik text,
  state text,
  industry_group text not null,
  filed_at text not null,
  first_sale_date text,
  total_offering_usd bigint,
  total_sold_usd bigint
);
create table if not exists release_provenance (
  document_id text primary key references documents(id),
  title text not null,
  origin text not null,
  captured_at text not null,
  speaker text,
  at text
);
create table if not exists connector_state (
  connector text primary key,
  last_sync_at text,
  documents integer,
  last_error text,
  last_error_at text
);
create table if not exists memberships (
  person_id text not null references people(id),
  principal text not null,
  primary key (person_id, principal)
);
