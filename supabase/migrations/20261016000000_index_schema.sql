-- Index — schema, access policies and library functions.
--
-- Every table carries user_id and is protected by row-level security, so a
-- signed-in user can only ever read or change their own rows. Join tables use
-- composite foreign keys (row id + user_id) so a row can never connect one
-- user's link to another user's category, tag or collection, even through a
-- bug in application code.
--
-- All functions are SECURITY INVOKER: they run as the calling user and are
-- bound by the same policies as plain table access.

-- ─── Types ──────────────────────────────────────────────────────────────────

create type public.reading_status as enum ('unread', 'reading', 'finished');

-- pending → processing → done | failed | skipped
create type public.processing_status as enum ('pending', 'processing', 'done', 'failed', 'skipped');

create type public.assignment_source as enum ('ai', 'user', 'import');

-- ─── Shared trigger helpers ─────────────────────────────────────────────────

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── Settings (one row per user) ────────────────────────────────────────────

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ai_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ─── Saved links ────────────────────────────────────────────────────────────

create table public.saved_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- The URL as saved (already normalized by the app) and its dedup key.
  url text not null check (char_length(url) between 1 and 4096),
  normalized_url text not null check (char_length(normalized_url) between 1 and 4096),
  domain text not null check (char_length(domain) between 1 and 255),
  -- Where the URL actually landed after redirects, and what the page declares
  -- as its canonical address.
  resolved_url text check (char_length(resolved_url) <= 4096),
  canonical_url text check (char_length(canonical_url) <= 4096),
  canonical_normalized_url text check (char_length(canonical_normalized_url) <= 4096),

  title text check (char_length(title) <= 500),
  description text check (char_length(description) <= 2000),
  author text check (char_length(author) <= 300),
  site_name text check (char_length(site_name) <= 200),
  published_at timestamptz,
  reading_minutes integer check (reading_minutes between 1 and 1440),
  word_count integer check (word_count >= 0),
  lang text check (char_length(lang) <= 35),
  content_type text check (char_length(content_type) <= 200),
  -- A bounded plain-text excerpt of the page, kept for classification and
  -- re-classification. Never rendered as HTML.
  content_excerpt text check (char_length(content_excerpt) <= 6000),

  status public.reading_status not null default 'unread',
  status_changed_at timestamptz,
  finished_at timestamptz,
  is_favorite boolean not null default false,
  favorited_at timestamptz,

  metadata_status public.processing_status not null default 'pending',
  metadata_error text check (char_length(metadata_error) <= 500),
  fetched_at timestamptz,
  classification_status public.processing_status not null default 'pending',
  classification_error text check (char_length(classification_error) <= 500),
  classified_at timestamptz,
  ai_model text check (char_length(ai_model) <= 100),
  processing_started_at timestamptz,

  -- Collections the classifier thought this might belong in. Suggestions only;
  -- nothing is added to a collection without the user's say-so.
  suggested_collection_ids uuid[] not null default '{}',

  -- Denormalized text kept current by triggers, so search covers categories,
  -- tags and notes without joins.
  taxonomy_text text not null default '',
  notes_text text not null default '',
  search_vector tsvector,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint saved_links_user_url_key unique (user_id, normalized_url),
  constraint saved_links_id_user_key unique (id, user_id)
);

create index saved_links_user_created_idx on public.saved_links (user_id, created_at desc, id desc);
create index saved_links_user_status_idx on public.saved_links (user_id, status, created_at desc);
create index saved_links_user_favorite_idx on public.saved_links (user_id, created_at desc) where is_favorite;
create index saved_links_user_domain_idx on public.saved_links (user_id, domain);
create index saved_links_user_published_idx on public.saved_links (user_id, published_at desc nulls last);
create index saved_links_user_canonical_idx on public.saved_links (user_id, canonical_normalized_url)
  where canonical_normalized_url is not null;
create index saved_links_pending_idx on public.saved_links (user_id, created_at)
  where metadata_status in ('pending', 'processing') or classification_status in ('pending', 'processing');
create index saved_links_search_idx on public.saved_links using gin (search_vector);

create function public.saved_links_before_write() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_changed_at := now();
      new.finished_at := case when new.status = 'finished' then now() else null end;
    end if;
    if new.is_favorite is distinct from old.is_favorite then
      new.favorited_at := case when new.is_favorite then now() else null end;
    end if;
  else
    if new.status <> 'unread' then
      new.status_changed_at := coalesce(new.status_changed_at, now());
      if new.status = 'finished' then
        new.finished_at := coalesce(new.finished_at, now());
      end if;
    end if;
    if new.is_favorite then
      new.favorited_at := coalesce(new.favorited_at, now());
    end if;
  end if;

  new.search_vector :=
    setweight(to_tsvector('english'::regconfig, coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, new.taxonomy_text), 'B') ||
    setweight(to_tsvector('english'::regconfig,
      coalesce(new.site_name, '') || ' ' || coalesce(new.author, '') || ' ' ||
      replace(new.domain, '.', ' ')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(new.description, '')), 'C') ||
    setweight(to_tsvector('english'::regconfig, new.notes_text), 'D');
  return new;
end;
$$;

create trigger saved_links_before_write
  before insert or update on public.saved_links
  for each row execute function public.saved_links_before_write();

-- ─── Categories ─────────────────────────────────────────────────────────────

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- Lowercase dedup key computed by the app (see src/lib/core/taxonomy.ts).
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  created_by public.assignment_source not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_user_slug_key unique (user_id, slug),
  constraint categories_id_user_key unique (id, user_id)
);

create trigger categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create table public.link_categories (
  link_id uuid not null,
  category_id uuid not null,
  user_id uuid not null default auth.uid(),
  source public.assignment_source not null default 'user',
  created_at timestamptz not null default now(),
  primary key (link_id, category_id),
  foreign key (link_id, user_id) references public.saved_links (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

create index link_categories_category_idx on public.link_categories (category_id);
create index link_categories_user_idx on public.link_categories (user_id);

-- ─── Tags ───────────────────────────────────────────────────────────────────

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  created_at timestamptz not null default now(),
  constraint tags_user_slug_key unique (user_id, slug),
  constraint tags_id_user_key unique (id, user_id)
);

create table public.link_tags (
  link_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null default auth.uid(),
  source public.assignment_source not null default 'user',
  created_at timestamptz not null default now(),
  primary key (link_id, tag_id),
  foreign key (link_id, user_id) references public.saved_links (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

create index link_tags_tag_idx on public.link_tags (tag_id);
create index link_tags_user_idx on public.link_tags (user_id);

-- ─── Collections ────────────────────────────────────────────────────────────

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_id_user_key unique (id, user_id)
);

create unique index collections_user_name_key on public.collections (user_id, lower(btrim(name)));
create index collections_user_created_idx on public.collections (user_id, created_at desc);

create trigger collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create table public.collection_links (
  collection_id uuid not null,
  link_id uuid not null,
  user_id uuid not null default auth.uid(),
  added_at timestamptz not null default now(),
  primary key (collection_id, link_id),
  foreign key (collection_id, user_id) references public.collections (id, user_id) on delete cascade,
  foreign key (link_id, user_id) references public.saved_links (id, user_id) on delete cascade
);

create index collection_links_link_idx on public.collection_links (link_id);
create index collection_links_user_idx on public.collection_links (user_id);

-- ─── Notes ──────────────────────────────────────────────────────────────────

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null,
  user_id uuid not null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (link_id, user_id) references public.saved_links (id, user_id) on delete cascade
);

create index notes_link_idx on public.notes (link_id, created_at);
create index notes_user_idx on public.notes (user_id);

create trigger notes_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ─── Classification cache ───────────────────────────────────────────────────
-- Raw classifier output keyed by a hash of the inputs, so re-saving a link or
-- retrying never pays for the same answer twice.

create table public.classification_cache (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cache_key text not null check (char_length(cache_key) between 16 and 128),
  model text not null check (char_length(model) <= 100),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, cache_key)
);

-- ─── Search text maintenance ────────────────────────────────────────────────

create function public.refresh_link_taxonomy(p_link_id uuid) returns void
language sql
set search_path = ''
as $$
  update public.saved_links l
  set taxonomy_text = coalesce((
        select string_agg(c.name, ' ' order by c.name)
        from public.link_categories lc
        join public.categories c on c.id = lc.category_id
        where lc.link_id = l.id
      ), '') || ' ' || coalesce((
        select string_agg(t.name, ' ' order by t.name)
        from public.link_tags lt
        join public.tags t on t.id = lt.tag_id
        where lt.link_id = l.id
      ), '')
  where l.id = p_link_id;
$$;

create function public.refresh_link_notes(p_link_id uuid) returns void
language sql
set search_path = ''
as $$
  update public.saved_links l
  set notes_text = left(coalesce((
        select string_agg(n.body, ' ' order by n.created_at)
        from public.notes n
        where n.link_id = l.id
      ), ''), 20000)
  where l.id = p_link_id;
$$;

create function public.link_assignment_changed() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_link_taxonomy(new.link_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    perform public.refresh_link_taxonomy(old.link_id);
  end if;
  return null;
end;
$$;

create trigger link_categories_changed
  after insert or update or delete on public.link_categories
  for each row execute function public.link_assignment_changed();

create trigger link_tags_changed
  after insert or update or delete on public.link_tags
  for each row execute function public.link_assignment_changed();

create function public.taxonomy_renamed() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    if tg_table_name = 'categories' then
      perform public.refresh_link_taxonomy(lc.link_id)
      from public.link_categories lc where lc.category_id = new.id;
    else
      perform public.refresh_link_taxonomy(lt.link_id)
      from public.link_tags lt where lt.tag_id = new.id;
    end if;
  end if;
  return null;
end;
$$;

create trigger categories_renamed
  after update of name on public.categories
  for each row execute function public.taxonomy_renamed();

create trigger tags_renamed
  after update of name on public.tags
  for each row execute function public.taxonomy_renamed();

create function public.notes_changed() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_link_notes(new.link_id);
  end if;
  if tg_op = 'DELETE' then
    perform public.refresh_link_notes(old.link_id);
  end if;
  return null;
end;
$$;

create trigger notes_changed
  after insert or update or delete on public.notes
  for each row execute function public.notes_changed();

-- ─── Row-level security ─────────────────────────────────────────────────────

alter table public.user_settings enable row level security;
alter table public.saved_links enable row level security;
alter table public.categories enable row level security;
alter table public.link_categories enable row level security;
alter table public.tags enable row level security;
alter table public.link_tags enable row level security;
alter table public.collections enable row level security;
alter table public.collection_links enable row level security;
alter table public.notes enable row level security;
alter table public.classification_cache enable row level security;

create policy "own settings" on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own links" on public.saved_links
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own categories" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own link categories" on public.link_categories
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own tags" on public.tags
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own link tags" on public.link_tags
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own collections" on public.collections
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own collection links" on public.collection_links
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own notes" on public.notes
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own classification cache" on public.classification_cache
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Anonymous visitors get nothing. Signed-in users get table privileges, and
-- the policies above decide which rows.
revoke all on public.user_settings, public.saved_links, public.categories, public.link_categories,
  public.tags, public.link_tags, public.collections, public.collection_links, public.notes,
  public.classification_cache from anon;
grant select, insert, update, delete on public.user_settings, public.saved_links, public.categories,
  public.link_categories, public.tags, public.link_tags, public.collections, public.collection_links,
  public.notes, public.classification_cache to authenticated;

-- ─── Library functions ──────────────────────────────────────────────────────

-- Builds a prefix-matching tsquery from free text: "stable coin" → 'stabl':* & 'coin':*.
-- Returns null when nothing searchable remains (e.g. only stop words).
create function public.search_query(p_text text) returns tsquery
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_source text;
  v_query tsquery;
begin
  select string_agg(quote_literal(token) || ':*', ' & ')
  into v_source
  from (
    select token
    from regexp_split_to_table(lower(coalesce(p_text, '')), '[^[:alnum:]]+') as token
    where token <> ''
    limit 12
  ) tokens;

  if v_source is null then
    return null;
  end if;

  v_query := to_tsquery('english'::regconfig, v_source);
  if numnode(v_query) = 0 then
    return null;
  end if;
  return v_query;
end;
$$;

-- Escapes LIKE wildcards in user text.
create function public.like_escape(p_text text) returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(coalesce(p_text, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Saves a link, or returns the existing row when the URL (or its canonical
-- form) is already in the library. Race-safe: concurrent saves of the same
-- URL resolve to one row.
create function public.save_link(
  p_url text,
  p_normalized_url text,
  p_domain text,
  p_title text default null
) returns table (link_id uuid, duplicate boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select l.id into v_id
  from public.saved_links l
  where l.user_id = (select auth.uid())
    and (l.normalized_url = p_normalized_url or l.canonical_normalized_url = p_normalized_url)
  limit 1;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  insert into public.saved_links (url, normalized_url, domain, title)
  values (p_url, p_normalized_url, p_domain, nullif(btrim(p_title), ''))
  on conflict (user_id, normalized_url) do nothing
  returning id into v_id;

  if v_id is null then
    select l.id into v_id
    from public.saved_links l
    where l.user_id = (select auth.uid()) and l.normalized_url = p_normalized_url;
    return query select v_id, true;
    return;
  end if;

  return query select v_id, false;
end;
$$;

-- One page of the library, with filters, search and sort. Categories and tags
-- come back inline as JSON arrays of {id, name, slug}.
create function public.list_links(
  p_query text default null,
  p_status public.reading_status default null,
  p_favorite boolean default null,
  p_category_id uuid default null,
  p_tag_id uuid default null,
  p_collection_id uuid default null,
  p_domain text default null,
  p_unsorted boolean default false,
  p_saved_from timestamptz default null,
  p_saved_to timestamptz default null,
  p_sort text default 'recent',
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  id uuid,
  url text,
  domain text,
  title text,
  description text,
  author text,
  site_name text,
  published_at timestamptz,
  reading_minutes integer,
  status public.reading_status,
  is_favorite boolean,
  created_at timestamptz,
  metadata_status public.processing_status,
  classification_status public.processing_status,
  categories jsonb,
  tags jsonb,
  rank real,
  total_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tsquery tsquery := public.search_query(p_query);
  v_text text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text := '%' || public.like_escape(btrim(coalesce(p_query, ''))) || '%';
  v_sort text := coalesce(p_sort, 'recent');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_sort = 'relevance' and v_text is null then
    v_sort := 'recent';
  end if;

  return query
  with matches as (
    select
      l.*,
      case
        when v_tsquery is not null and l.search_vector @@ v_tsquery
          then ts_rank_cd(l.search_vector, v_tsquery)
        else 0
      end::real as match_rank
    from public.saved_links l
    where l.user_id = (select auth.uid())
      and (p_status is null or l.status = p_status)
      and (p_favorite is null or l.is_favorite = p_favorite)
      and (p_domain is null or l.domain = lower(p_domain))
      and (p_saved_from is null or l.created_at >= p_saved_from)
      and (p_saved_to is null or l.created_at < p_saved_to)
      and (p_category_id is null or exists (
        select 1 from public.link_categories lc where lc.link_id = l.id and lc.category_id = p_category_id))
      and (p_tag_id is null or exists (
        select 1 from public.link_tags lt where lt.link_id = l.id and lt.tag_id = p_tag_id))
      and (p_collection_id is null or exists (
        select 1 from public.collection_links cl where cl.link_id = l.id and cl.collection_id = p_collection_id))
      and (not coalesce(p_unsorted, false) or not exists (
        select 1 from public.link_categories lc where lc.link_id = l.id))
      and (
        v_text is null
        or (v_tsquery is not null and l.search_vector @@ v_tsquery)
        or l.title ilike v_like
        or l.domain ilike v_like
        or l.url ilike v_like
      )
  ),
  page as (
    select m.*, count(*) over () as full_count
    from matches m
    order by
      case when v_sort = 'relevance' then m.match_rank end desc nulls last,
      case when v_sort = 'oldest' then m.created_at end asc,
      case when v_sort = 'alpha' then lower(coalesce(m.title, m.domain)) end asc,
      case when v_sort = 'published' then m.published_at end desc nulls last,
      m.created_at desc,
      m.id desc
    limit v_limit
    offset v_offset
  )
  select
    p.id, p.url, p.domain, p.title, p.description, p.author, p.site_name, p.published_at,
    p.reading_minutes, p.status, p.is_favorite, p.created_at, p.metadata_status,
    p.classification_status,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) order by c.name)
      from public.link_categories lc
      join public.categories c on c.id = lc.category_id
      where lc.link_id = p.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug) order by t.name)
      from public.link_tags lt
      join public.tags t on t.id = lt.tag_id
      where lt.link_id = p.id
    ), '[]'::jsonb),
    p.match_rank,
    p.full_count
  from page p
  order by
    case when v_sort = 'relevance' then p.match_rank end desc nulls last,
    case when v_sort = 'oldest' then p.created_at end asc,
    case when v_sort = 'alpha' then lower(coalesce(p.title, p.domain)) end asc,
    case when v_sort = 'published' then p.published_at end desc nulls last,
    p.created_at desc,
    p.id desc;
end;
$$;

-- Counts for the stats line and the sidebar.
create function public.library_stats() returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*),
    'unread', count(*) filter (where l.status = 'unread'),
    'reading', count(*) filter (where l.status = 'reading'),
    'finished', count(*) filter (where l.status = 'finished'),
    'favorites', count(*) filter (where l.is_favorite),
    'unsorted', count(*) filter (where not exists (
      select 1 from public.link_categories lc where lc.link_id = l.id)),
    'pending', count(*) filter (where l.metadata_status in ('pending', 'processing')
      or l.classification_status in ('pending', 'processing')),
    'categories', (select count(*) from public.categories c where c.user_id = (select auth.uid())),
    'collections', (select count(*) from public.collections c where c.user_id = (select auth.uid()))
  )
  from public.saved_links l
  where l.user_id = (select auth.uid());
$$;

create function public.category_summaries() returns table (
  id uuid,
  name text,
  slug text,
  link_count bigint,
  created_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, c.slug, count(lc.link_id), c.created_at
  from public.categories c
  left join public.link_categories lc on lc.category_id = c.id
  where c.user_id = (select auth.uid())
  group by c.id
  order by lower(c.name);
$$;

create function public.collection_summaries() returns table (
  id uuid,
  name text,
  description text,
  link_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, c.description, count(cl.link_id), c.created_at, c.updated_at
  from public.collections c
  left join public.collection_links cl on cl.collection_id = c.id
  where c.user_id = (select auth.uid())
  group by c.id
  order by c.updated_at desc;
$$;

create function public.source_summaries(p_limit integer default 100) returns table (
  domain text,
  site_name text,
  link_count bigint
)
language sql
stable
set search_path = ''
as $$
  select l.domain, max(l.site_name), count(*)
  from public.saved_links l
  where l.user_id = (select auth.uid())
  group by l.domain
  order by count(*) desc, l.domain
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- Applies a classifier result. Categories and tags arrive as [{name, slug}],
-- already matched against the user's existing vocabulary by the app; rows are
-- reused by slug and created only when missing. Categories the user set by
-- hand are never replaced by the classifier.
create function public.apply_classification(
  p_link_id uuid,
  p_categories jsonb,
  p_tags jsonb,
  p_collection_ids uuid[] default '{}',
  p_model text default null
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_item jsonb;
  v_id uuid;
  v_has_user_categories boolean;
begin
  if not exists (select 1 from public.saved_links where id = p_link_id and user_id = v_user) then
    raise exception 'link not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.link_categories
    where link_id = p_link_id and source in ('user', 'import')
  ) into v_has_user_categories;

  if not v_has_user_categories then
    delete from public.link_categories where link_id = p_link_id and source = 'ai';

    for v_item in select * from jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) loop
      insert into public.categories (name, slug, created_by)
      values (btrim(v_item->>'name'), v_item->>'slug', 'ai')
      on conflict (user_id, slug) do update set slug = excluded.slug
      returning id into v_id;

      insert into public.link_categories (link_id, category_id, source)
      values (p_link_id, v_id, 'ai')
      on conflict do nothing;
    end loop;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) loop
    insert into public.tags (name, slug)
    values (btrim(v_item->>'name'), v_item->>'slug')
    on conflict (user_id, slug) do update set slug = excluded.slug
    returning id into v_id;

    insert into public.link_tags (link_id, tag_id, source)
    values (p_link_id, v_id, 'ai')
    on conflict do nothing;
  end loop;

  update public.saved_links
  set classification_status = 'done',
      classification_error = null,
      classified_at = now(),
      ai_model = p_model,
      processing_started_at = null,
      suggested_collection_ids = coalesce((
        select array_agg(distinct c.id)
        from public.collections c
        where c.id = any(coalesce(p_collection_ids, '{}'))
          and c.user_id = v_user
          and not exists (
            select 1 from public.collection_links cl
            where cl.collection_id = c.id and cl.link_id = p_link_id)
      ), '{}')
  where id = p_link_id;
end;
$$;

-- Replaces a link's categories with the given set (by hand). Missing
-- categories are created.
create function public.set_link_categories(p_link_id uuid, p_categories jsonb) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_item jsonb;
  v_id uuid;
  v_keep uuid[] := '{}';
begin
  if not exists (select 1 from public.saved_links where id = p_link_id and user_id = v_user) then
    raise exception 'link not found' using errcode = 'P0002';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) loop
    insert into public.categories (name, slug, created_by)
    values (btrim(v_item->>'name'), v_item->>'slug', 'user')
    on conflict (user_id, slug) do update set slug = excluded.slug
    returning id into v_id;
    v_keep := v_keep || v_id;

    insert into public.link_categories (link_id, category_id, source)
    values (p_link_id, v_id, 'user')
    on conflict (link_id, category_id) do update set source = 'user';
  end loop;

  delete from public.link_categories
  where link_id = p_link_id and not (category_id = any(v_keep));

  update public.saved_links
  set classification_status = case
        when classification_status in ('pending', 'processing', 'failed', 'skipped') then 'done'
        else classification_status end,
      processing_started_at = null
  where id = p_link_id;
end;
$$;

-- Adds a tag to a link, creating the tag if needed. Returns the tag.
create function public.add_link_tag(p_link_id uuid, p_name text, p_slug text)
returns table (id uuid, name text, slug text)
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.saved_links l where l.id = p_link_id and l.user_id = (select auth.uid())) then
    raise exception 'link not found' using errcode = 'P0002';
  end if;

  insert into public.tags (name, slug)
  values (btrim(p_name), p_slug)
  on conflict on constraint tags_user_slug_key do update set slug = excluded.slug
  returning tags.id into v_id;

  insert into public.link_tags (link_id, tag_id, source)
  values (p_link_id, v_id, 'user')
  on conflict do nothing;

  return query select t.id, t.name, t.slug from public.tags t where t.id = v_id;
end;
$$;

-- Moves every link from one category into another, then removes the source.
create function public.merge_categories(p_source_id uuid, p_target_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if p_source_id = p_target_id then
    return;
  end if;
  if (select count(*) from public.categories where id in (p_source_id, p_target_id) and user_id = v_user) <> 2 then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  insert into public.link_categories (link_id, category_id, source)
  select lc.link_id, p_target_id, lc.source
  from public.link_categories lc
  where lc.category_id = p_source_id
  on conflict (link_id, category_id) do nothing;

  delete from public.categories where id = p_source_id;
end;
$$;

-- Other saved links about similar things: shared categories and tags (weighted
-- by how rare they are in this library), overlapping title words, and the same
-- source. This is the seam where semantic embeddings can be added later as one
-- more weighted signal.
create function public.related_links(p_link_id uuid, p_limit integer default 6)
returns table (
  id uuid,
  url text,
  domain text,
  title text,
  site_name text,
  status public.reading_status,
  created_at timestamptz,
  score real,
  shared_categories text[],
  shared_tags text[]
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_total real;
  v_domain text;
  v_title text;
  v_keywords tsquery;
begin
  select l.domain, l.title into v_domain, v_title
  from public.saved_links l
  where l.id = p_link_id and l.user_id = v_user;

  if not found then
    return;
  end if;

  select greatest(count(*), 1)::real into v_total from public.saved_links where user_id = v_user;

  -- Significant title words, OR-ed together.
  select to_tsquery('english'::regconfig, string_agg(quote_literal(w), ' | '))
  into v_keywords
  from (
    select distinct w
    from regexp_split_to_table(lower(coalesce(v_title, '')), '[^[:alnum:]]+') w
    where char_length(w) >= 4
    limit 16
  ) words;
  if v_keywords is not null and numnode(v_keywords) = 0 then
    v_keywords := null;
  end if;

  return query
  with
  target_categories as (
    select lc.category_id from public.link_categories lc where lc.link_id = p_link_id
  ),
  target_tags as (
    select lt.tag_id from public.link_tags lt where lt.link_id = p_link_id
  ),
  category_weights as (
    select tc.category_id, ln(1 + v_total / greatest(count(lc.link_id), 1))::real as weight
    from target_categories tc
    join public.link_categories lc on lc.category_id = tc.category_id
    group by tc.category_id
  ),
  tag_weights as (
    select tt.tag_id, (1.5 * ln(1 + v_total / greatest(count(lt.link_id), 1)))::real as weight
    from target_tags tt
    join public.link_tags lt on lt.tag_id = tt.tag_id
    group by tt.tag_id
  ),
  signals as (
    select lc.link_id, cw.weight as s, c.name as category_name, null::text as tag_name
    from public.link_categories lc
    join category_weights cw on cw.category_id = lc.category_id
    join public.categories c on c.id = lc.category_id
    where lc.link_id <> p_link_id
    union all
    select lt.link_id, tw.weight, null, t.name
    from public.link_tags lt
    join tag_weights tw on tw.tag_id = lt.tag_id
    join public.tags t on t.id = lt.tag_id
    where lt.link_id <> p_link_id
    union all
    select l.id, (4 * ts_rank(l.search_vector, v_keywords))::real, null, null
    from public.saved_links l
    where v_keywords is not null
      and l.user_id = v_user
      and l.id <> p_link_id
      and l.search_vector @@ v_keywords
    union all
    select l.id, 0.3::real, null, null
    from public.saved_links l
    where l.user_id = v_user and l.id <> p_link_id and l.domain = v_domain
  ),
  scored as (
    select
      s.link_id,
      sum(s.s)::real as total,
      array_remove(array_agg(distinct s.category_name), null) as cats,
      array_remove(array_agg(distinct s.tag_name), null) as tags
    from signals s
    group by s.link_id
  )
  select l.id, l.url, l.domain, l.title, l.site_name, l.status, l.created_at,
         sc.total, sc.cats, sc.tags
  from scored sc
  join public.saved_links l on l.id = sc.link_id
  where sc.total >= 0.75
  order by sc.total desc, l.created_at desc
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
end;
$$;

-- Three quiet picks from the archive: something long unread, a favorite, and
-- anything at all. Stable for a given seed, so a page reload shows the same
-- picks until the user asks for others.
create function public.rediscover(p_seed text default '')
returns table (
  kind text,
  id uuid,
  url text,
  domain text,
  title text,
  description text,
  author text,
  site_name text,
  reading_minutes integer,
  status public.reading_status,
  is_favorite boolean,
  created_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_seed text := coalesce(p_seed, '');
  v_forgotten uuid;
  v_favorite uuid;
  v_random uuid;
begin
  select l.id into v_forgotten
  from public.saved_links l
  where l.user_id = v_user and l.status = 'unread' and l.created_at < now() - interval '30 days'
  order by md5(l.id::text || v_seed)
  limit 1;

  if v_forgotten is null then
    select l.id into v_forgotten
    from public.saved_links l
    where l.user_id = v_user and l.status = 'unread' and l.created_at < now() - interval '3 days'
    order by l.created_at asc
    limit 1;
  end if;

  select l.id into v_favorite
  from public.saved_links l
  where l.user_id = v_user and l.is_favorite and l.id is distinct from v_forgotten
  order by md5(l.id::text || v_seed)
  limit 1;

  select l.id into v_random
  from public.saved_links l
  where l.user_id = v_user
    and l.id is distinct from v_forgotten
    and l.id is distinct from v_favorite
  order by md5(v_seed || l.id::text)
  limit 1;

  return query
  select picks.kind, l.id, l.url, l.domain, l.title, l.description, l.author, l.site_name,
         l.reading_minutes, l.status, l.is_favorite, l.created_at
  from (values (1, 'forgotten', v_forgotten), (2, 'favorite', v_favorite), (3, 'random', v_random))
    as picks(ord, kind, link_id)
  join public.saved_links l on l.id = picks.link_id
  order by picks.ord;
end;
$$;

-- Bulk import. Each row: {url, normalized_url, domain, title?, description?,
-- status?, is_favorite?, created_at?, note?, categories?: [{name, slug}],
-- tags?: [{name, slug}]}. Existing URLs are skipped, never overwritten.
create function public.import_links(p_rows jsonb) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb;
  v_item jsonb;
  v_link uuid;
  v_id uuid;
  v_imported integer := 0;
  v_duplicates integer := 0;
  v_has_categories boolean;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'expected an array of at most 1000 rows' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_has_categories := jsonb_array_length(coalesce(v_row->'categories', '[]'::jsonb)) > 0;

    insert into public.saved_links (
      url, normalized_url, domain, title, description, status, is_favorite, created_at,
      classification_status
    )
    values (
      v_row->>'url',
      v_row->>'normalized_url',
      v_row->>'domain',
      nullif(btrim(v_row->>'title'), ''),
      nullif(btrim(v_row->>'description'), ''),
      coalesce((v_row->>'status')::public.reading_status, 'unread'),
      coalesce((v_row->>'is_favorite')::boolean, false),
      coalesce((v_row->>'created_at')::timestamptz, now()),
      case when v_has_categories then 'done'::public.processing_status else 'pending'::public.processing_status end
    )
    on conflict (user_id, normalized_url) do nothing
    returning id into v_link;

    if v_link is null then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;
    v_imported := v_imported + 1;

    for v_item in select * from jsonb_array_elements(coalesce(v_row->'categories', '[]'::jsonb)) loop
      insert into public.categories (name, slug, created_by)
      values (btrim(v_item->>'name'), v_item->>'slug', 'import')
      on conflict (user_id, slug) do update set slug = excluded.slug
      returning id into v_id;
      insert into public.link_categories (link_id, category_id, source)
      values (v_link, v_id, 'import')
      on conflict do nothing;
    end loop;

    for v_item in select * from jsonb_array_elements(coalesce(v_row->'tags', '[]'::jsonb)) loop
      insert into public.tags (name, slug)
      values (btrim(v_item->>'name'), v_item->>'slug')
      on conflict (user_id, slug) do update set slug = excluded.slug
      returning id into v_id;
      insert into public.link_tags (link_id, tag_id, source)
      values (v_link, v_id, 'import')
      on conflict do nothing;
    end loop;

    if nullif(btrim(v_row->>'note'), '') is not null then
      insert into public.notes (link_id, body) values (v_link, left(btrim(v_row->>'note'), 20000));
    end if;

    v_link := null;
  end loop;

  return jsonb_build_object('imported', v_imported, 'duplicates', v_duplicates);
end;
$$;

-- The whole library as one JSON document, for export.
create function public.export_library() returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'url', l.url,
        'canonical_url', l.canonical_url,
        'title', l.title,
        'description', l.description,
        'author', l.author,
        'site_name', l.site_name,
        'domain', l.domain,
        'published_at', l.published_at,
        'reading_minutes', l.reading_minutes,
        'status', l.status,
        'is_favorite', l.is_favorite,
        'saved_at', l.created_at,
        'finished_at', l.finished_at,
        'categories', coalesce((
          select jsonb_agg(c.name order by c.name)
          from public.link_categories lc join public.categories c on c.id = lc.category_id
          where lc.link_id = l.id), '[]'::jsonb),
        'tags', coalesce((
          select jsonb_agg(t.name order by t.name)
          from public.link_tags lt join public.tags t on t.id = lt.tag_id
          where lt.link_id = l.id), '[]'::jsonb),
        'collections', coalesce((
          select jsonb_agg(co.name order by co.name)
          from public.collection_links cl join public.collections co on co.id = cl.collection_id
          where cl.link_id = l.id), '[]'::jsonb),
        'notes', coalesce((
          select jsonb_agg(jsonb_build_object('body', n.body, 'created_at', n.created_at) order by n.created_at)
          from public.notes n where n.link_id = l.id), '[]'::jsonb)
      ) order by l.created_at desc)
      from public.saved_links l
      where l.user_id = (select auth.uid())
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'description', c.description, 'created_at', c.created_at)
        order by c.created_at)
      from public.collections c where c.user_id = (select auth.uid())
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(c.name order by lower(c.name))
      from public.categories c where c.user_id = (select auth.uid())
    ), '[]'::jsonb)
  );
$$;

-- Atomically takes ownership of a link for background processing, so two
-- workers never fetch or classify the same link at once. A claim older than
-- five minutes is considered abandoned.
create function public.claim_link_processing(p_link_id uuid, p_force boolean default false)
returns setof public.saved_links
language sql
set search_path = ''
as $$
  update public.saved_links l
  set processing_started_at = now(),
      metadata_status = case
        when l.metadata_status in ('pending', 'failed') or (p_force and l.metadata_status <> 'processing')
          or (l.metadata_status = 'processing' and l.processing_started_at < now() - interval '5 minutes')
        then 'processing'::public.processing_status
        else l.metadata_status end,
      classification_status = case
        when l.classification_status in ('pending', 'failed') or (p_force and l.classification_status = 'skipped')
          or (l.classification_status = 'processing' and l.processing_started_at < now() - interval '5 minutes')
        then 'processing'::public.processing_status
        else l.classification_status end
  where l.id = p_link_id
    and l.user_id = (select auth.uid())
    and (l.processing_started_at is null or l.processing_started_at < now() - interval '5 minutes')
    and (
      l.metadata_status in ('pending', 'failed')
      or l.classification_status in ('pending', 'failed')
      or (p_force and (l.metadata_status <> 'processing' or l.classification_status = 'skipped'))
      or l.metadata_status = 'processing'
      or l.classification_status = 'processing'
    )
  returning l.*;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.refresh_link_taxonomy(uuid),
  public.refresh_link_notes(uuid),
  public.search_query(text),
  public.like_escape(text),
  public.save_link(text, text, text, text),
  public.list_links(text, public.reading_status, boolean, uuid, uuid, uuid, text, boolean, timestamptz, timestamptz, text, integer, integer),
  public.library_stats(),
  public.category_summaries(),
  public.collection_summaries(),
  public.source_summaries(integer),
  public.apply_classification(uuid, jsonb, jsonb, uuid[], text),
  public.set_link_categories(uuid, jsonb),
  public.add_link_tag(uuid, text, text),
  public.merge_categories(uuid, uuid),
  public.related_links(uuid, integer),
  public.rediscover(text),
  public.import_links(jsonb),
  public.export_library(),
  public.claim_link_processing(uuid, boolean)
to authenticated;
