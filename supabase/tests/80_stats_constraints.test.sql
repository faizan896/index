-- library_stats(), category_summaries(), collection_summaries(),
-- source_summaries() numbers; check constraints, slug format and uniqueness
-- rules.
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-8000-4000-8000-000000000001', 'stats-a@example.com'),
  ('bbbbbbbb-8000-4000-8000-000000000002', 'stats-b@example.com');

-- ─── Counts ─────────────────────────────────────────────────────────────────
do $$
declare
  v_apple uuid;
  v_mango uuid;
  v_new uuid;
begin
  perform tests.login('aaaaaaaa-8000-4000-8000-000000000001');

  perform tests.eq(public.library_stats(), jsonb_build_object('total', 0, 'unread', 0, 'reading', 0, 'finished', 0, 'favorites', 0,
    'unsorted', 0, 'pending', 0, 'categories', 0, 'collections', 0), 'empty library: all zeros');
  perform tests.eq((select count(*) from public.category_summaries()), 0::bigint, 'no categories');
  perform tests.eq((select count(*) from public.collection_summaries()), 0::bigint, 'no collections');
  perform tests.eq((select count(*) from public.source_summaries()), 0::bigint, 'no sources');

  insert into public.saved_links (url, normalized_url, domain, site_name, status, is_favorite, metadata_status, classification_status)
  values
    ('https://a.example.com/1', 'https://a.example.com/1', 'a.example.com', 'A Site', 'unread', true, 'done', 'done'),
    ('https://a.example.com/2', 'https://a.example.com/2', 'a.example.com', null, 'unread', false, 'pending', 'pending'),
    ('https://b.example.com/3', 'https://b.example.com/3', 'b.example.com', null, 'unread', false, 'done', 'processing'),
    ('https://b.example.com/4', 'https://b.example.com/4', 'b.example.com', null, 'reading', true, 'failed', 'skipped'),
    ('https://b.example.com/5', 'https://b.example.com/5', 'b.example.com', null, 'reading', false, 'done', 'done'),
    ('https://c.example.com/6', 'https://c.example.com/6', 'c.example.com', null, 'finished', false, 'processing', 'done');
  insert into public.categories (name, slug) values ('apple', 'apple') returning id into v_apple;
  insert into public.categories (name, slug) values ('Mango', 'mango') returning id into v_mango;
  insert into public.categories (name, slug) values ('Zebra', 'zebra');
  insert into public.link_categories (link_id, category_id)
  select l.id, c.id from public.saved_links l, public.categories c
  where (l.url like '%/1' and c.id = v_apple) or (l.url like '%/4' and c.id in (v_apple, v_mango)) or (l.url like '%/5' and c.id = v_mango);
  insert into public.collections (name, updated_at) values ('Old', '2020-01-01');
  insert into public.collections (name, updated_at) values ('New', '2025-01-01') returning id into v_new;
  insert into public.collection_links (collection_id, link_id)
  select v_new, id from public.saved_links where url like '%/1' or url like '%/2';

  perform tests.eq(public.library_stats(), jsonb_build_object('total', 6, 'unread', 3, 'reading', 2, 'finished', 1, 'favorites', 2,
    'unsorted', 3, 'pending', 3, 'categories', 3, 'collections', 2), 'library_stats');

  perform tests.eq((select array_agg(s.name || ':' || s.link_count order by o) from public.category_summaries() with ordinality as s(id, name, slug, link_count, created_at, o)),
    array['apple:2', 'Mango:2', 'Zebra:0'], 'category_summaries: counts, case-insensitive name order, empty included');
  perform tests.eq((select slug from public.category_summaries() where id = v_mango), 'mango', 'category slug');

  perform tests.eq((select array_agg(s.name || ':' || s.link_count order by o)
    from public.collection_summaries() with ordinality as s(id, name, description, link_count, created_at, updated_at, o)),
    array['New:2', 'Old:0'], 'collection_summaries: counts, most recently updated first');

  perform tests.eq((select array_agg(s.domain || ':' || coalesce(s.site_name, '-') || ':' || s.link_count order by o)
    from public.source_summaries() with ordinality as s(domain, site_name, link_count, o)),
    array['b.example.com:-:3', 'a.example.com:A Site:2', 'c.example.com:-:1'], 'source_summaries: most saved first, with a site name');
  perform tests.eq((select array_agg(domain) from public.source_summaries(1)), array['b.example.com'], 'source limit');
  perform tests.eq((select count(*) from public.source_summaries(0)), 1::bigint, 'source limit below 1 is 1');
  perform tests.eq((select count(*) from public.source_summaries(null)), 3::bigint, 'null source limit is the default');

  -- Status and favorite changes move the counts.
  update public.saved_links set status = 'finished', metadata_status = 'done', classification_status = 'done', is_favorite = true;
  perform tests.eq(public.library_stats(), jsonb_build_object('total', 6, 'unread', 0, 'reading', 0, 'finished', 6, 'favorites', 6,
    'unsorted', 3, 'pending', 0, 'categories', 3, 'collections', 2), 'library_stats after changes');

  perform tests.logout();
end;
$$;

-- ─── Check constraints ──────────────────────────────────────────────────────
do $$
declare
  v_link uuid;
  v_case record;
begin
  perform tests.login('aaaaaaaa-8000-4000-8000-000000000001');
  v_link := tests.link('https://limits.example.com/x', 'Limits');

  for v_case in
    select * from (values
      ('url', ''), ('url', repeat('u', 4097)), ('normalized_url', ''), ('normalized_url', repeat('u', 4097)),
      ('domain', ''), ('domain', repeat('d', 256)),
      ('resolved_url', repeat('u', 4097)), ('canonical_url', repeat('u', 4097)), ('canonical_normalized_url', repeat('u', 4097)),
      ('title', repeat('t', 501)), ('description', repeat('d', 2001)), ('author', repeat('a', 301)),
      ('site_name', repeat('s', 201)), ('lang', repeat('l', 36)), ('content_type', repeat('c', 201)),
      ('content_excerpt', repeat('e', 6001)), ('metadata_error', repeat('m', 501)), ('classification_error', repeat('c', 501)),
      ('ai_model', repeat('m', 101))
    ) as cases(col, val)
  loop
    perform tests.throws(format('update public.saved_links set %I = %L where id = %L', v_case.col, v_case.val, v_link), '23514',
      format('saved_links.%s rejects %s characters', v_case.col, char_length(v_case.val)));
  end loop;
  perform tests.throws(format('update public.saved_links set reading_minutes = 0 where id = %L', v_link), '23514', 'reading_minutes 0');
  perform tests.throws(format('update public.saved_links set reading_minutes = 1441 where id = %L', v_link), '23514', 'reading_minutes 1441');
  perform tests.throws(format('update public.saved_links set word_count = -1 where id = %L', v_link), '23514', 'word_count -1');
  perform tests.throws(format($q$update public.saved_links set status = 'archived' where id = %L$q$, v_link), '22P02', 'unknown status');

  -- The limits themselves are accepted.
  update public.saved_links
  set title = repeat('t', 500), description = repeat('d', 2000), author = repeat('a', 300), site_name = repeat('s', 200),
      reading_minutes = 1440, word_count = 0, content_excerpt = repeat('e', 6000), domain = repeat('d', 255), lang = repeat('l', 35)
  where id = v_link;
  update public.saved_links set reading_minutes = 1 where id = v_link;

  -- One row per normalized URL per user.
  perform tests.throws($q$insert into public.saved_links (url, normalized_url, domain)
    values ('https://LIMITS.example.com/x', 'https://limits.example.com/x', 'limits.example.com')$q$, '23505', 'duplicate normalized url');

  -- Categories and tags: names 1–60 characters after trimming, slugs lowercase words joined by single hyphens, ≤ 80.
  for v_case in
    select * from (values
      ('', 'empty'), ('   ', 'blank'), (repeat('n', 61), 'long')
    ) as cases(name, slug)
  loop
    perform tests.throws(format('insert into public.categories (name, slug) values (%L, %L)', v_case.name, v_case.slug), '23514',
      format('category name %L rejected', left(v_case.name, 10)));
    perform tests.throws(format('insert into public.tags (name, slug) values (%L, %L)', v_case.name, v_case.slug), '23514',
      format('tag name %L rejected', left(v_case.name, 10)));
  end loop;
  for v_case in
    select * from (values (''), ('Upper'), ('two words'), ('double--dash'), ('-lead'), ('trail-'), ('under_score'), ('ümlaut'),
      ('dot.ted'), (repeat('s', 81)), (e'new\nline')) as cases(slug)
  loop
    perform tests.throws(format('insert into public.categories (name, slug) values (%L, %L)', 'Name', v_case.slug), '23514',
      format('category slug %L rejected', left(v_case.slug, 20)));
    perform tests.throws(format('insert into public.tags (name, slug) values (%L, %L)', 'Name', v_case.slug), '23514',
      format('tag slug %L rejected', left(v_case.slug, 20)));
  end loop;
  insert into public.categories (name, slug) values
    (repeat('n', 60), 'a'), ('B', 'a-b-c'), ('C', '9to5'), ('建築', 'u-5efa-7bc9'), ('D', repeat('s', 80));
  insert into public.tags (name, slug) values ('A', 'a'), ('B', 'a-b-c'), ('C', '9to5'), ('建築', 'u-5efa-7bc9'), ('D', repeat('s', 80));
  perform tests.throws($q$insert into public.categories (name, slug) values ('Another A', 'a')$q$, '23505', 'category slug unique per user');
  perform tests.throws($q$insert into public.tags (name, slug) values ('Another A', 'a')$q$, '23505', 'tag slug unique per user');

  -- Collections: names unique per user, ignoring case and surrounding spaces.
  insert into public.collections (name) values ('Reading List');
  perform tests.throws($q$insert into public.collections (name) values ('reading list')$q$, '23505', 'collection name, other case');
  perform tests.throws($q$insert into public.collections (name) values ('  READING LIST ')$q$, '23505', 'collection name, padded');
  insert into public.collections (name) values ('Reading Lists');
  perform tests.throws($q$update public.collections set name = 'reading list' where name = 'Reading Lists'$q$, '23505',
    'renaming onto an existing name');
  perform tests.throws($q$insert into public.collections (name) values ('   ')$q$, '23514', 'blank collection name');
  perform tests.throws(format('insert into public.collections (name) values (%L)', repeat('c', 121)), '23514', 'long collection name');
  perform tests.throws(format($q$insert into public.collections (name, description) values ('Described', %L)$q$, repeat('d', 1001)),
    '23514', 'long collection description');
  insert into public.collections (name, description) values (repeat('c', 120), repeat('d', 1000));

  -- Notes: 1–20,000 characters, not blank.
  perform tests.throws(format($q$insert into public.notes (link_id, body) values (%L, '  ')$q$, v_link), '23514', 'blank note');
  perform tests.throws(format('insert into public.notes (link_id, body) values (%L, %L)', v_link, repeat('n', 20001)), '23514', 'long note');
  insert into public.notes (link_id, body) values (v_link, repeat('n', 20000));

  -- Classification cache keys are 16–128 characters.
  perform tests.throws($q$insert into public.classification_cache (cache_key, model, result) values ('short', 'm', '{}')$q$,
    '23514', 'short cache key');
  perform tests.throws(format($q$insert into public.classification_cache (cache_key, model, result) values (%L, 'm', '{}')$q$,
    repeat('k', 129)), '23514', 'long cache key');
  perform tests.throws(format($q$insert into public.classification_cache (cache_key, model, result) values (%L, %L, '{}')$q$,
    repeat('k', 16), repeat('m', 101)), '23514', 'long model name');
  insert into public.classification_cache (cache_key, model, result) values (repeat('k', 16), 'm', '{}');
  perform tests.throws(format($q$insert into public.classification_cache (cache_key, model, result) values (%L, 'm', '{}')$q$,
    repeat('k', 16)), '23505', 'one cache entry per key');

  perform tests.logout();

  -- Another user may reuse every name and slug.
  perform tests.login('bbbbbbbb-8000-4000-8000-000000000002');
  insert into public.collections (name) values ('Reading List');
  insert into public.categories (name, slug) values ('A', 'a');
  insert into public.tags (name, slug) values ('A', 'a');
  insert into public.classification_cache (cache_key, model, result) values (repeat('k', 16), 'm', '{}');
  perform tests.eq(tests.link('https://limits.example.com/x') is not null, true, 'same URL for another user');
  perform tests.logout();
end;
$$;

rollback;
