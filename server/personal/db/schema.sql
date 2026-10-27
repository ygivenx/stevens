create table items (
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
create table segments (
  id text primary key,
  item_id text not null references items(id),
  seq integer not null,
  text text not null,
  speaker text,
  start_ms integer,
  end_ms integer,
  locator text
);
create virtual table segments_fts using fts5(text, segment_id unindexed);
create table claims (
  id text primary key,
  item_id text not null references items(id),
  segment_id text not null references segments(id),
  entity text not null,
  metric text,
  value text,
  quote text not null
);
create table shares (
  claim_id text primary key references claims(id),
  deal_id text not null,
  firm_document_id text not null,
  shared_at text not null
);
create table adapter_state (
  adapter text primary key,
  cursor text,
  last_sync_at text,
  last_error text
);
