create table if not exists items (
  id text primary key,
  origin text not null,
  origin_id text not null,
  kind text not null,
  title text not null,
  captured_at text not null,
  media_path text,
  content_hash text not null unique,
  ingested_at text not null,
  status text not null,
  error text
);
create table if not exists segments (
  id text primary key,
  item_id text not null references items(id),
  seq integer not null,
  text text not null,
  speaker text,
  start_ms integer,
  end_ms integer,
  locator text
);
create virtual table if not exists segments_fts using fts5(text, segment_id unindexed);
create table if not exists claims (
  id text primary key,
  item_id text not null references items(id),
  segment_id text not null references segments(id),
  entity text not null,
  metric text,
  value text,
  quote text not null
);
create table if not exists shares (
  claim_id text primary key references claims(id),
  deal_id text not null,
  firm_document_id text not null,
  shared_at text not null
);
create table if not exists adapter_state (
  adapter text primary key,
  cursor text,
  last_sync_at text,
  last_error text
);
create table if not exists vault_meta (
  origin text not null,
  origin_id text not null,
  tags text not null,
  aliases text not null,
  links text not null,
  primary key (origin, origin_id)
);
create table if not exists events (
  uid text not null,
  starts_at text not null,
  ends_at text,
  title text not null,
  attendees text not null,
  location text,
  description text,
  primary key (uid, starts_at)
);
create table if not exists conversations (
  id text primary key,
  question_id text not null,
  role text not null,
  text text not null,
  citations text,
  created_at text not null
);
