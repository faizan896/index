-- Performance with a realistic library: 5,000 links with categories, tags,
-- notes and collections, owned by one user and queried as that user (so
-- row-level security is in the measurement).
--
-- The fixture is committed (like real data) and removed at the end; a
-- leftover from an interrupted run is removed first. Each measured call is
-- warmed up, then timed over 10 runs (past PL/pgSQL's switch from custom to
-- generic plans after five), and the median must stay under the budget:
-- list_links 150 ms (with and without search), related_links 200 ms.
-- Timings and plans are reported as INFO lines.

delete from auth.users where id = 'eeeeeeee-9500-4000-8000-000000000001';
insert into auth.users (id, email) values ('eeeeeeee-9500-4000-8000-000000000001', 'performance@example.com');

begin;

do $$
declare
  v_started timestamptz := clock_timestamp();
  v_words constant text[] := array[
    'bank', 'banking', 'banks', 'stablecoins', 'monetary', 'policy', 'inflation', 'rates', 'markets', 'credit',
    'climate', 'energy', 'solar', 'carbon', 'grid', 'battery', 'design', 'typography', 'grid', 'layout',
    'history', 'rome', 'empire', 'medieval', 'archive', 'letters', 'architecture', 'cities', 'housing', 'transit',
    'software', 'compilers', 'databases', 'postgres', 'indexes', 'latency', 'security', 'privacy', 'browsers', 'networks',
    'biology', 'genome', 'cells', 'protein', 'evolution', 'medicine', 'sleep', 'memory', 'attention', 'learning',
    'writing', 'essays', 'novels', 'poetry', 'editing', 'reading', 'libraries', 'publishing', 'journalism', 'media',
    'music', 'jazz', 'piano', 'film', 'cinema', 'photography', 'painting', 'museums', 'craft', 'woodworking',
    'travel', 'japan', 'kyoto', 'alps', 'walking', 'cycling', 'food', 'bread', 'coffee', 'fermentation',
    'startups', 'management', 'hiring', 'strategy', 'pricing', 'product', 'research', 'interviews', 'remote', 'teams',
    'physics', 'quantum', 'space', 'orbits', 'telescopes', 'mathematics', 'proofs', 'statistics', 'probability', 'logic',
    'philosophy', 'ethics', 'stoicism', 'language', 'linguistics', 'translation', 'psychology', 'habits', 'focus', 'time'];
  v_categories constant text[] := array[
    'Finance', 'Economics', 'Technology', 'Design', 'Science', 'History', 'Politics', 'Climate', 'Health', 'Culture',
    'Art', 'Music', 'Film', 'Books', 'Travel', 'Food', 'Sports', 'Education', 'Philosophy', 'Psychology',
    'Business', 'Startups', 'Programming', 'Security', 'Artificial Intelligence', 'Space', 'Physics', 'Biology', 'Medicine', 'Law',
    'Media', 'Writing', 'Photography', 'Architecture', 'Urbanism', 'Energy', 'Transport', 'Crypto', 'Markets', 'Careers'];
begin
  perform tests.login('eeeeeeee-9500-4000-8000-000000000001');

  insert into public.categories (name, slug)
  select name, lower(replace(name, ' ', '-')) from unnest(v_categories) as name;
  insert into public.tags (name, slug)
  select initcap(v_words[1 + (i * 7) % 110]) || ' ' || i, v_words[1 + (i * 7) % 110] || '-' || i
  from generate_series(1, 300) i;
  insert into public.collections (name) select 'Collection ' || i from generate_series(1, 10) i;

  insert into public.saved_links (
    url, normalized_url, domain, title, description, author, site_name, published_at, reading_minutes,
    status, is_favorite, created_at, metadata_status, classification_status, content_excerpt)
  select
    'https://site' || (n % 250) || '.example.com/articles/' || n,
    'https://site' || (n % 250) || '.example.com/articles/' || n,
    'site' || (n % 250) || '.example.com',
    case when n % 50 = 0 then null else
      initcap((select string_agg(v_words[1 + (n * 7 + k * 13 + k * k) % 110], ' ') from generate_series(0, 3 + n % 4) k)) end,
    (select string_agg(v_words[1 + (n * 11 + k * 17) % 110], ' ') from generate_series(0, 14 + n % 10) k),
    case when n % 3 = 0 then 'Author ' || (n % 400) end,
    case when n % 2 = 0 then 'Site ' || (n % 250) end,
    case when n % 10 < 7 then now() - n * interval '3 hours' - (n % 90) * interval '1 day' end,
    1 + n % 40,
    (array['unread', 'unread', 'unread', 'reading', 'finished'])[1 + n % 5]::public.reading_status,
    n % 11 = 0,
    now() - n * interval '3 hours',
    case when n % 97 = 0 then 'pending' else 'done' end::public.processing_status,
    case when n % 89 = 0 then 'pending' else 'done' end::public.processing_status,
    case when n % 2 = 0 then repeat((select string_agg(v_words[1 + (n * 3 + k * 7) % 110], ' ') from generate_series(0, 30) k) || '. ', 6) end
  from generate_series(1, 5000) n;

  insert into public.link_categories (link_id, category_id)
  select l.id, c.id
  from (select id, row_number() over (order by created_at desc) as n from public.saved_links) l
  join (select id, row_number() over (order by name) as i from public.categories) c
    on c.i = 1 + (l.n * l.n) % 40 or (l.n % 3 = 0 and c.i = 1 + (l.n / 3) % 40)
  where l.n % 17 <> 0
  on conflict do nothing;

  insert into public.link_tags (link_id, tag_id)
  select l.id, t.id
  from (select id, row_number() over (order by created_at desc) as n from public.saved_links) l
  join (select id, row_number() over (order by slug) as i from public.tags) t
    on t.i in (1 + (l.n * 7) % 300, 1 + (l.n * 11 + 5) % 300, case when l.n % 2 = 0 then 1 + (l.n * 13 + 7) % 300 end)
  on conflict do nothing;

  insert into public.notes (link_id, body)
  select id, 'A note about ' || coalesce(title, domain) || '. Remember the part on fermentation and sourdough.'
  from public.saved_links where hashtext(id::text) % 10 = 0;

  insert into public.collection_links (collection_id, link_id)
  select c.id, l.id
  from (select id, row_number() over (order by name) as i from public.collections) c
  join (select id, row_number() over (order by created_at) as n from public.saved_links) l on l.n % 100 = c.i;

  raise info 'fixture: % links, % category and % tag assignments, % notes, built in % ms',
    (select count(*) from public.saved_links), (select count(*) from public.link_categories),
    (select count(*) from public.link_tags), (select count(*) from public.notes),
    round(extract(epoch from clock_timestamp() - v_started) * 1000);

  perform tests.logout();
end;
$$;

commit;

-- What autovacuum would have done by now: statistics, and the GIN pending list
-- flushed into the index (until then every search also scans the list).
vacuum (analyze) public.saved_links, public.categories, public.link_categories, public.tags, public.link_tags,
  public.collections, public.collection_links, public.notes;

begin;

-- Median/min/max milliseconds of running a query p_runs times after p_warmup runs.
create function pg_temp.timed(p_label text, p_sql text, p_budget_ms numeric default null, p_runs int default 10, p_warmup int default 2)
returns numeric
language plpgsql
as $$
declare
  v_times numeric[] := '{}';
  v_started timestamptz;
  v_rows bigint;
  v_median numeric;
  i int;
begin
  -- count(q) uses every column, so no part of the result can be skipped by the planner.
  for i in 1..p_warmup loop
    execute 'select count(q) from (' || p_sql || ') q' into v_rows;
  end loop;
  for i in 1..p_runs loop
    v_started := clock_timestamp();
    execute 'select count(q) from (' || p_sql || ') q' into v_rows;
    v_times := v_times || (extract(epoch from clock_timestamp() - v_started) * 1000)::numeric;
  end loop;
  select percentile_cont(0.5) within group (order by t) into v_median from unnest(v_times) t;
  raise info '% — % rows — median % ms (min %, max %)%', rpad(p_label, 44), lpad(v_rows::text, 4),
    round(v_median, 1), round((select min(t) from unnest(v_times) t), 1), round((select max(t) from unnest(v_times) t), 1),
    case when p_budget_ms is not null then format(' — budget %s ms', p_budget_ms) else '' end;
  if p_budget_ms is not null and v_median > p_budget_ms then
    raise exception 'FAILED: % took % ms (median of %), over the % ms budget', p_label, round(v_median, 1), p_runs, p_budget_ms;
  end if;
  return v_median;
end;
$$;

do $$
declare
  v_link uuid;
  v_category uuid;
  v_line text;
begin
  perform tests.login('eeeeeeee-9500-4000-8000-000000000001');

  -- Sanity: the searches below find something, so they measure real work.
  perform tests.ok((select max(total_count) from public.list_links(p_query => 'bank')) > 1000, 'bank matches about half the library');
  perform tests.ok((select max(total_count) from public.list_links(p_query => 'monetary pol')) > 10, 'two-word search matches');

  select id into v_link from public.saved_links l
  where exists (select 1 from public.link_tags t where t.link_id = l.id)
    and exists (select 1 from public.link_categories c where c.link_id = l.id)
    and l.title is not null
  order by l.created_at desc limit 1;
  select category_id into v_category from public.link_categories group by category_id order by count(*) desc limit 1;

  perform pg_temp.timed('list_links, page 1', 'select * from public.list_links()', 150);
  perform pg_temp.timed('list_links, search "bank"', $q$select * from public.list_links(p_query => 'bank')$q$, 150);
  perform pg_temp.timed('list_links, search "monetary pol", relevance',
    $q$select * from public.list_links(p_query => 'monetary pol', p_sort => 'relevance')$q$, 150);
  perform pg_temp.timed('list_links, search "the" (substring fallback)', $q$select * from public.list_links(p_query => 'the')$q$, 150);
  perform pg_temp.timed('list_links, search "fermentation" (notes)', $q$select * from public.list_links(p_query => 'fermentation')$q$, 150);
  perform pg_temp.timed('list_links, largest category, unread',
    format($q$select * from public.list_links(p_category_id => %L, p_status => 'unread')$q$, v_category), 150);
  perform pg_temp.timed('list_links, unsorted', 'select * from public.list_links(p_unsorted => true)', 150);
  perform pg_temp.timed('list_links, alpha, 200 per page', $q$select * from public.list_links(p_sort => 'alpha', p_limit => 200)$q$, 150);
  perform pg_temp.timed('list_links, last page', 'select * from public.list_links(p_offset => 4980)', 150);
  perform pg_temp.timed('related_links', format('select * from public.related_links(%L)', v_link), 200);
  perform pg_temp.timed('library_stats', 'select public.library_stats()');
  perform pg_temp.timed('category_summaries', 'select * from public.category_summaries()');
  perform pg_temp.timed('get_link_item', format('select * from public.get_link_item(%L)', v_link));
  perform pg_temp.timed('link_detail', format('select public.link_detail(%L)', v_link));
  perform pg_temp.timed('rediscover', $q$select * from public.rediscover('seed')$q$);
  perform pg_temp.timed('export_library (5,000 links)', 'select public.export_library()', null, 3, 1);

  -- Plans, for the record (not asserted: the planner may rightly choose differently).
  -- Under row-level security PostgreSQL only uses leakproof operators as index
  -- conditions, and @@ (ts_match_vq) is not leakproof, so a signed-in user's
  -- search filters that user's rows rather than probing the GIN index. As the
  -- table owner (no RLS) the same predicate does use the index.
  raise info 'plan as the signed-in user: list_links'' search predicate (full text OR substring fallback):';
  for v_line in execute $q$explain (costs off)
    select l.id from public.saved_links l
    where l.user_id = (select auth.uid())
      and (l.search_vector @@ public.search_query('bank') or l.title ilike '%bank%' or l.domain ilike '%bank%' or l.url ilike '%bank%')$q$ loop
    raise info '  %', v_line;
  end loop;
  perform tests.logout();
  raise info 'plan as the table owner (RLS bypassed): a rare word, same user filter:';
  for v_line in execute $q$explain (costs off)
    select l.id from public.saved_links l
    where l.user_id = 'eeeeeeee-9500-4000-8000-000000000001' and l.search_vector @@ public.search_query('xylograph')$q$ loop
    raise info '  %', v_line;
  end loop;
  raise info '@@ (ts_match_vq) leakproof: %', (select proleakproof from pg_proc where oid = 'ts_match_vq'::regproc);
end;
$$;

rollback;

delete from auth.users where id = 'eeeeeeee-9500-4000-8000-000000000001';
