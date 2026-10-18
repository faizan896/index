-- import_links(): counts, duplicates (within a call, across calls, by
-- canonical URL), what each row creates, limits; export_library(): shape.
begin;

insert into auth.users (id, email) values ('aaaaaaaa-7000-4000-8000-000000000001', 'import-a@example.com');

do $$
declare
  v_result jsonb;
  v_row public.saved_links;
  v_rows jsonb;
begin
  perform tests.login('aaaaaaaa-7000-4000-8000-000000000001');

  v_result := public.import_links($j$[
    {"url": "https://example.com/one", "normalized_url": "https://example.com/one", "domain": "example.com",
     "title": "  One  ", "description": "First import", "status": "finished", "is_favorite": true,
     "created_at": "2019-05-01T10:00:00Z", "note": "  Loved it  ",
     "categories": [{"name": "Essays", "slug": "essays"}, {"name": "Science", "slug": "science"}],
     "tags": [{"name": "Longform", "slug": "longform"}]},
    {"url": "https://example.com/two", "normalized_url": "https://example.com/two", "domain": "example.com",
     "title": null, "description": null, "status": null, "is_favorite": false, "created_at": null, "note": null,
     "categories": [], "tags": [{"name": "Longform", "slug": "longform"}]},
    {"url": "https://Example.com/one", "normalized_url": "https://example.com/one", "domain": "example.com", "title": "Dupe in file"},
    {"url": "https://example.com/three", "normalized_url": "https://example.com/three", "domain": "example.com",
     "status": "reading", "note": "   ", "categories": [{"name": "Essays", "slug": "essays"}]}
  ]$j$);
  perform tests.eq(v_result, '{"imported": 3, "duplicates": 1}'::jsonb, 'counts, with a duplicate inside the call');

  select * into v_row from public.saved_links where normalized_url = 'https://example.com/one';
  perform tests.eq(v_row.title, 'One', 'title trimmed');
  perform tests.eq(v_row.description, 'First import', 'description');
  perform tests.eq(v_row.status, 'finished'::public.reading_status, 'status honored');
  perform tests.eq(v_row.is_favorite, true, 'favorite honored');
  perform tests.eq(v_row.created_at, '2019-05-01T10:00:00Z'::timestamptz, 'created_at honored');
  perform tests.ok(v_row.finished_at is not null and v_row.favorited_at is not null and v_row.status_changed_at is not null,
    'status timestamps filled in');
  perform tests.eq(v_row.classification_status, 'done'::public.processing_status, 'categorized rows need no classification');
  perform tests.eq(v_row.metadata_status, 'pending'::public.processing_status, 'metadata still to fetch');
  perform tests.eq(v_row.notes_text, 'Loved it', 'note created, trimmed');
  perform tests.eq(v_row.taxonomy_text, 'Essays Science Longform', 'search text built');
  perform tests.eq((select array_agg(c.slug || ':' || c.created_by || ':' || lc.source order by c.slug)
    from public.link_categories lc join public.categories c on c.id = lc.category_id where lc.link_id = v_row.id),
    array['essays:import:import', 'science:import:import'], 'categories created and assigned as imports');
  perform tests.eq((select array_agg(lt.source::text) from public.link_tags lt where lt.link_id = v_row.id), array['import'],
    'tags assigned as imports');

  select * into v_row from public.saved_links where normalized_url = 'https://example.com/two';
  perform tests.ok(v_row.title is null and v_row.description is null, 'nulls stay null');
  perform tests.eq(v_row.status, 'unread'::public.reading_status, 'null status is unread');
  perform tests.eq(v_row.created_at, now(), 'null created_at is now');
  perform tests.eq(v_row.classification_status, 'pending'::public.processing_status, 'uncategorized rows wait for classification');
  perform tests.eq((select count(*) from public.notes where link_id = v_row.id), 0::bigint, 'no note');

  select * into v_row from public.saved_links where normalized_url = 'https://example.com/three';
  perform tests.eq((select count(*) from public.notes where link_id = v_row.id), 0::bigint, 'blank note skipped');
  perform tests.eq(v_row.status, 'reading'::public.reading_status, 'reading honored');
  perform tests.ok(v_row.finished_at is null, 'reading has no finished_at');

  perform tests.eq((select count(*) from public.categories), 2::bigint, 'categories reused by slug across rows');
  perform tests.eq((select count(*) from public.tags), 1::bigint, 'tags reused by slug across rows');
  perform tests.eq((select title from public.saved_links where normalized_url = 'https://example.com/one'), 'One',
    'the duplicate row did not overwrite');

  -- Across calls: everything already there is a duplicate, and nothing is overwritten.
  v_result := public.import_links($j$[
    {"url": "https://example.com/one", "normalized_url": "https://example.com/one", "domain": "example.com", "title": "Changed",
     "status": "unread", "categories": [{"name": "Other", "slug": "other"}], "note": "again"},
    {"url": "https://example.com/four", "normalized_url": "https://example.com/four", "domain": "example.com"}
  ]$j$);
  perform tests.eq(v_result, '{"imported": 1, "duplicates": 1}'::jsonb, 'duplicates across calls');
  select * into v_row from public.saved_links where normalized_url = 'https://example.com/one';
  perform tests.eq(v_row.title || '/' || v_row.status, 'One/finished', 'existing link untouched');
  perform tests.eq((select count(*) from public.notes where link_id = v_row.id), 1::bigint, 'no extra note');
  perform tests.eq((select count(*) from public.categories where slug = 'other'), 0::bigint, 'skipped rows create nothing');

  -- A URL that is the canonical address of a saved link is a duplicate too.
  update public.saved_links set canonical_normalized_url = 'https://example.com/canonical-one'
  where normalized_url = 'https://example.com/one';
  perform tests.eq(public.import_links(
    '[{"url": "https://example.com/canonical-one", "normalized_url": "https://example.com/canonical-one", "domain": "example.com"}]'),
    '{"imported": 0, "duplicates": 1}'::jsonb, 'canonical duplicate');

  -- Overlong text is cut to the column limits rather than failing the batch.
  perform tests.eq(public.import_links(jsonb_build_array(jsonb_build_object(
    'url', 'https://example.com/long', 'normalized_url', 'https://example.com/long', 'domain', 'example.com',
    'title', repeat('t', 800), 'description', repeat('d', 3000), 'note', repeat('n', 25000)))),
    '{"imported": 1, "duplicates": 0}'::jsonb, 'long values imported');
  select * into v_row from public.saved_links where normalized_url = 'https://example.com/long';
  perform tests.eq(array[char_length(v_row.title), char_length(v_row.description), char_length(v_row.notes_text)],
    array[500, 2000, 20000], 'cut to 500 / 2000 / 20000');

  -- Limits and malformed input.
  perform tests.eq(public.import_links('[]'), '{"imported": 0, "duplicates": 0}'::jsonb, 'empty array');
  perform tests.eq(public.import_links(null), '{"imported": 0, "duplicates": 0}'::jsonb, 'null');
  select jsonb_agg(jsonb_build_object('url', 'https://bulk.example.com/' || n, 'normalized_url', 'https://bulk.example.com/' || n,
    'domain', 'bulk.example.com')) into v_rows from generate_series(1, 1001) n;
  perform tests.throws(format('select public.import_links(%L)', v_rows), '22023', 'more than 1000 rows rejected');
  perform tests.eq((select count(*) from public.saved_links where domain = 'bulk.example.com'), 0::bigint, 'nothing imported');
  perform tests.eq(public.import_links(v_rows - 1000), '{"imported": 1000, "duplicates": 0}'::jsonb, 'exactly 1000 rows accepted');
  perform tests.throws($q$select public.import_links('{"url": "https://example.com"}')$q$, '22023', 'an object is not a batch');
  perform tests.throws($q$select public.import_links('"https://example.com"')$q$, '22023', 'a string is not a batch');
  perform tests.throws($q$select public.import_links('[{"url": "https://example.com/x", "normalized_url": "https://example.com/x",
    "domain": "example.com", "status": "archived"}]')$q$, '22P02', 'unknown status rejected');
  perform tests.throws($q$select public.import_links('[{"url": "https://example.com/x", "domain": "example.com"}]')$q$,
    '23502', 'missing normalized url rejected');

  perform tests.logout();
end;
$$;

-- ─── export_library ─────────────────────────────────────────────────────────
do $$
declare
  v_export jsonb;
  v_link jsonb;
  v_collection uuid;
begin
  perform tests.login('aaaaaaaa-7000-4000-8000-000000000001');
  delete from public.saved_links where domain = 'bulk.example.com';
  insert into public.collections (name, description) values ('Keepers', 'The best') returning id into v_collection;
  insert into public.collection_links (collection_id, link_id)
  select v_collection, id from public.saved_links where normalized_url = 'https://example.com/one';
  insert into public.categories (name, slug) values ('Unused', 'unused');

  v_export := public.export_library();
  perform tests.eq((select array_agg(k order by k) from jsonb_object_keys(v_export) k), array['categories', 'collections', 'links'],
    'top-level keys');
  perform tests.eq(jsonb_array_length(v_export->'links'), 5, 'every link');
  perform tests.eq(v_export->'categories', '["Essays", "Science", "Unused"]'::jsonb, 'category names, alphabetical, used or not');
  perform tests.eq(v_export->'collections'->0->>'name', 'Keepers', 'collection name');
  perform tests.eq(v_export->'collections'->0->>'description', 'The best', 'collection description');
  perform tests.ok(v_export->'collections'->0 ? 'created_at', 'collection created_at');

  select l into v_link from jsonb_array_elements(v_export->'links') l where l->>'url' = 'https://example.com/one';
  perform tests.eq((select array_agg(k order by k) from jsonb_object_keys(v_link) k),
    array['author', 'canonical_url', 'categories', 'collections', 'description', 'domain', 'finished_at', 'is_favorite', 'notes',
          'published_at', 'reading_minutes', 'saved_at', 'site_name', 'status', 'tags', 'title', 'url'],
    'link keys');
  perform tests.eq(v_link->>'title', 'One', 'title');
  perform tests.eq(v_link->>'status', 'finished', 'status');
  perform tests.eq(v_link->'is_favorite', 'true'::jsonb, 'favorite as a boolean');
  perform tests.eq((v_link->>'saved_at')::timestamptz, '2019-05-01T10:00:00Z'::timestamptz, 'saved_at is created_at');
  perform tests.eq(v_link->'categories', '["Essays", "Science"]'::jsonb, 'category names');
  perform tests.eq(v_link->'tags', '["Longform"]'::jsonb, 'tag names');
  perform tests.eq(v_link->'collections', '["Keepers"]'::jsonb, 'collection names');
  perform tests.eq(v_link->'notes'->0->>'body', 'Loved it', 'note body');
  perform tests.ok(v_link->'notes'->0 ? 'created_at', 'note created_at');
  perform tests.eq(v_link->'author', 'null'::jsonb, 'missing values are JSON null');

  select l into v_link from jsonb_array_elements(v_export->'links') l where l->>'url' = 'https://example.com/two';
  perform tests.eq(v_link->'categories', '[]'::jsonb, 'empty lists are arrays');
  perform tests.eq(v_link->'notes', '[]'::jsonb, 'no notes is an array');

  perform tests.ok(not exists (
    select 1
    from jsonb_array_elements(v_export->'links') with ordinality as a(l, n)
    join jsonb_array_elements(v_export->'links') with ordinality as b(l, n) on b.n = a.n + 1
    where (a.l->>'saved_at')::timestamptz < (b.l->>'saved_at')::timestamptz), 'most recently saved first');
  perform tests.eq((v_export->'links'->-1->>'url'), 'https://example.com/one', 'oldest (2019) last');

  -- An empty library exports empty arrays, not nulls.
  delete from public.saved_links;
  delete from public.collections;
  delete from public.categories;
  perform tests.eq(public.export_library(), '{"links": [], "collections": [], "categories": []}'::jsonb, 'empty export');

  perform tests.logout();
end;
$$;

rollback;
