create table people (
  id text primary key,
  name text not null,
  role text not null,
  agent_token_sha256 text
);
create table deals (
  id text primary key,
  company text not null,
  sector text not null,
  stage text not null,
  ask_usd integer
);
create table deal_team (
  deal_id text not null references deals(id),
  person_id text not null references people(id),
  primary key (deal_id, person_id)
);
create table meetings (
  id text primary key,
  deal_id text not null references deals(id),
  title text not null,
  starts_at text not null
);
create table documents (
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
create table document_acl (
  document_id text not null references documents(id),
  principal text not null,
  primary key (document_id, principal)
);
create table portfolio (
  company text primary key,
  sector text not null
);
create table filings (
  accession text primary key,
  issuer text not null,
  state text,
  industry_group text not null,
  filed_at text not null,
  first_sale_date text,
  total_offering_usd integer,
  total_sold_usd integer
);
create table connector_state (
  connector text primary key,
  last_sync_at text,
  documents integer,
  last_error text
);
