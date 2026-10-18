-- apply_classification(), set_link_categories(), add_link_tag() and
-- merge_categories().
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-5000-4000-8000-000000000001', 'taxonomy-a@example.com'),
  ('bbbbbbbb-5000-4000-8000-000000000002', 'taxonomy-b@example.com');

-- B owns a collection whose id A will try to have suggested.
do $$
begin
  perform tests.login('bbbbbbbb-5000-4000-8000-000000000002');
  insert into public.collections (id, name) values ('bbbbbbbb-5000-4000-8000-0000000000e1', 'B''s shelf');
  perform tests.logout();
end;
$$;

-- ─── apply_classification ───────────────────────────────────────────────────
do $$
declare
  v_link uuid;
  v_other uuid;
  v_row public.saved_links;
  v_shelf uuid;
  v_inbox uuid;
  v_done uuid;
begin
  perform tests.login('aaaaaaaa-5000-4000-8000-000000000001');
  v_link := tests.link('https://example.com/stablecoins', 'Stablecoins and banks');
  insert into public.categories (name, slug, created_by) values ('Finance', 'finance', 'user');
  insert into public.collections (name) values ('Shelf') returning id into v_shelf;
  insert into public.collections (name) values ('Inbox') returning id into v_inbox;
  insert into public.collections (name) values ('Done') returning id into v_done;
  insert into public.collection_links (collection_id, link_id) values (v_done, v_link);
  update public.saved_links set processing_started_at = now(), classification_status = 'processing',
    classification_error = 'old error' where id = v_link;

  perform public.apply_classification(
    v_link,
    '[{"name": "Finance (AI spelling)", "slug": "finance"}, {"name": " Crypto Assets ", "slug": "crypto-assets"}]',
    '[{"name": "Stablecoins", "slug": "stablecoins"}, {"name": "USDC", "slug": "usdc"}]',
    array[v_shelf, v_shelf, v_done, 'bbbbbbbb-5000-4000-8000-0000000000e1', gen_random_uuid(), v_inbox],
    'claude-test');

  select * into v_row from public.saved_links where id = v_link;
  perform tests.eq(v_row.classification_status, 'done'::public.processing_status, 'status done');
  perform tests.ok(v_row.classification_error is null, 'error cleared');
  perform tests.eq(v_row.classified_at, now(), 'classified_at stamped');
  perform tests.eq(v_row.ai_model, 'claude-test', 'model recorded');
  perform tests.ok(v_row.processing_started_at is null, 'claim released');
  perform tests.eq(v_row.metadata_status, 'pending'::public.processing_status, 'metadata status untouched');
  perform tests.eq(tests.sorted(v_row.suggested_collection_ids), tests.sorted(array[v_shelf, v_inbox]),
    'suggestions: own collections only, deduplicated, not ones already holding the link');

  -- Existing category reused by slug (name and creator untouched); the new one created as AI.
  perform tests.eq((select count(*) from public.categories), 2::bigint, 'one category created');
  perform tests.eq((select name || '/' || created_by from public.categories where slug = 'finance'), 'Finance/user', 'existing category kept as is');
  perform tests.eq((select name || '/' || created_by from public.categories where slug = 'crypto-assets'), 'Crypto Assets/ai',
    'new category trimmed and marked ai');
  perform tests.eq((select array_agg(c.slug || ':' || lc.source order by c.slug) from public.link_categories lc
    join public.categories c on c.id = lc.category_id where lc.link_id = v_link),
    array['crypto-assets:ai', 'finance:ai'], 'assignments are ai-sourced');
  perform tests.eq((select array_agg(t.slug || ':' || lt.source order by t.slug) from public.link_tags lt
    join public.tags t on t.id = lt.tag_id where lt.link_id = v_link), array['stablecoins:ai', 'usdc:ai'], 'tags added');
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_link), 'Crypto Assets Finance Stablecoins USDC',
    'search text follows');

  -- A re-run replaces earlier AI categories, keeps (and adds to) tags.
  perform public.apply_classification(v_link, '[{"name": "Economics", "slug": "economics"}]',
    '[{"name": "Stablecoins", "slug": "stablecoins"}, {"name": "Tether", "slug": "tether"}]', null, 'claude-test-2');
  perform tests.eq((select array_agg(c.slug order by c.slug) from public.link_categories lc
    join public.categories c on c.id = lc.category_id where lc.link_id = v_link), array['economics'], 'ai categories replaced');
  perform tests.eq((select array_agg(t.slug order by t.slug) from public.link_tags lt
    join public.tags t on t.id = lt.tag_id where lt.link_id = v_link), array['stablecoins', 'tether', 'usdc'], 'tags accumulate');
  perform tests.eq((select count(*) from public.tags where slug = 'stablecoins'), 1::bigint, 'tag reused by slug');
  perform tests.eq((select suggested_collection_ids from public.saved_links where id = v_link), '{}'::uuid[], 'null suggestions → none');
  perform tests.eq((select ai_model from public.saved_links where id = v_link), 'claude-test-2', 'model updated');
  perform tests.eq((select count(*) from public.categories where slug = 'crypto-assets'), 1::bigint,
    'replaced categories remain in the vocabulary');

  -- Empty and null inputs.
  perform public.apply_classification(v_link, '[]', null);
  perform tests.eq((select count(*) from public.link_categories where link_id = v_link), 0::bigint, 'empty list clears ai categories');
  perform tests.eq((select count(*) from public.link_tags where link_id = v_link), 3::bigint, 'null tags change nothing');

  -- Categories the user chose by hand are never touched by the classifier.
  v_other := tests.link('https://example.com/hand-picked', 'Hand picked');
  perform public.set_link_categories(v_other, '[{"name": "Reading", "slug": "reading"}]');
  perform public.apply_classification(v_other, '[{"name": "Economics", "slug": "economics"}]', '[{"name": "Essay", "slug": "essay"}]',
    array[v_shelf], 'm');
  perform tests.eq((select array_agg(c.slug || ':' || lc.source) from public.link_categories lc
    join public.categories c on c.id = lc.category_id where lc.link_id = v_other), array['reading:user'], 'user categories untouched');
  perform tests.eq((select array_agg(t.slug) from public.link_tags lt join public.tags t on t.id = lt.tag_id where lt.link_id = v_other),
    array['essay'], 'tags still added');
  perform tests.eq((select classification_status from public.saved_links where id = v_other), 'done'::public.processing_status,
    'status done');
  perform tests.eq((select suggested_collection_ids from public.saved_links where id = v_other), array[v_shelf], 'suggestions still set');

  -- …nor are imported ones.
  perform tests.eq(public.import_links('[{"url": "https://example.com/imported", "normalized_url": "https://example.com/imported",
    "domain": "example.com", "categories": [{"name": "Archive", "slug": "archive"}]}]'), '{"imported": 1, "duplicates": 0}'::jsonb,
    'imported a categorized link');
  select id into v_other from public.saved_links where normalized_url = 'https://example.com/imported';
  perform public.apply_classification(v_other, '[{"name": "Economics", "slug": "economics"}]', '[]');
  perform tests.eq((select array_agg(c.slug || ':' || lc.source) from public.link_categories lc
    join public.categories c on c.id = lc.category_id where lc.link_id = v_other), array['archive:import'], 'imported categories untouched');

  -- Mixed: a hand-picked category alongside an AI one blocks AI replacement entirely.
  insert into public.link_categories (link_id, category_id, source)
  select v_link, id, 'ai' from public.categories where slug = 'economics';
  insert into public.link_categories (link_id, category_id, source)
  select v_link, id, 'user' from public.categories where slug = 'finance';
  perform public.apply_classification(v_link, '[{"name": "Markets", "slug": "markets"}]', '[]');
  perform tests.eq((select array_agg(c.slug order by c.slug) from public.link_categories lc
    join public.categories c on c.id = lc.category_id where lc.link_id = v_link), array['economics', 'finance'],
    'with a hand-picked category present, nothing is replaced');
  perform tests.eq((select count(*) from public.categories where slug = 'markets'), 0::bigint, 'and nothing is created');

  -- Bad input is rejected as a whole (the app validates first).
  v_other := tests.link('https://example.com/bad-input', 'Bad input');
  perform tests.throws(format($q$select public.apply_classification(%L,
    '[{"name": "Good", "slug": "good"}, {"name": "Bad", "slug": "Not A Slug"}]', '[]')$q$, v_other),
    '23514', 'invalid slug rejected');
  perform tests.eq((select count(*) from public.categories where slug = 'good'), 0::bigint, 'nothing from a rejected run is kept');
  perform tests.throws(format($q$select public.apply_classification(%L, '[{"slug": "nameless"}]', '[]')$q$, v_other),
    '23502', 'missing name rejected');
  perform tests.throws(format($q$select public.apply_classification(%L, '[]', '[{"name": "Tag", "slug": "tag--double"}]')$q$, v_other),
    '23514', 'invalid tag slug rejected');
  perform tests.eq((select classification_status from public.saved_links where id = v_other), 'pending'::public.processing_status,
    'a rejected run leaves the link pending');
  perform tests.throws(format($q$select public.apply_classification(%L, '[]', '[]')$q$, gen_random_uuid()), 'P0002', 'unknown link');

  perform tests.logout();
end;
$$;

-- ─── set_link_categories ────────────────────────────────────────────────────
do $$
declare
  v_link uuid;
  v_row public.saved_links;
begin
  perform tests.login('aaaaaaaa-5000-4000-8000-000000000001');
  v_link := tests.link('https://example.com/manual', 'Manual');
  perform public.apply_classification(v_link, '[{"name": "Economics", "slug": "economics"}, {"name": "Policy", "slug": "policy"}]', '[]');

  perform public.set_link_categories(v_link, '[{"name": "Policy", "slug": "policy"}, {"name": "Brand New", "slug": "brand-new"}]');
  perform tests.eq((select array_agg(c.slug || ':' || lc.source order by c.slug) from public.link_categories lc
    join public.categories c on c.id = lc.category_id where lc.link_id = v_link), array['brand-new:user', 'policy:user'],
    'replaced: kept one becomes user-sourced, missing one created, unlisted one removed');
  perform tests.eq((select created_by from public.categories where slug = 'brand-new'), 'user'::public.assignment_source,
    'created as a user category');
  perform tests.eq((select created_by from public.categories where slug = 'policy'), 'ai'::public.assignment_source,
    'existing category keeps its creator');
  perform tests.eq((select count(*) from public.categories where slug = 'economics'), 1::bigint, 'unassigned category still exists');
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_link), 'Brand New Policy', 'search text follows');

  perform public.set_link_categories(v_link, '[{"name": "Policy", "slug": "policy"}, {"name": "Policy", "slug": "policy"}]');
  perform tests.eq((select count(*) from public.link_categories where link_id = v_link), 1::bigint, 'duplicates in the input collapse');

  perform public.set_link_categories(v_link, '[]');
  perform tests.eq((select count(*) from public.link_categories where link_id = v_link), 0::bigint, 'empty list removes all');
  perform tests.eq(tests.ids('public.list_links(p_unsorted => true)') @> array[v_link], true, 'now unsorted');
  perform public.set_link_categories(v_link, null);
  perform tests.eq((select count(*) from public.link_categories where link_id = v_link), 0::bigint, 'null is an empty list');

  -- Choosing categories settles classification (failed, pending, processing or skipped → done).
  update public.saved_links set classification_status = 'failed', metadata_status = 'done', processing_started_at = now()
  where id = v_link;
  perform public.set_link_categories(v_link, '[{"name": "Policy", "slug": "policy"}]');
  select * into v_row from public.saved_links where id = v_link;
  perform tests.eq(v_row.classification_status, 'done'::public.processing_status, 'failed → done');
  perform tests.ok(v_row.processing_started_at is null, 'claim released when nothing else is running');

  update public.saved_links set classification_status = 'processing', metadata_status = 'processing', processing_started_at = now()
  where id = v_link;
  perform public.set_link_categories(v_link, '[{"name": "Policy", "slug": "policy"}]');
  select * into v_row from public.saved_links where id = v_link;
  perform tests.eq(v_row.classification_status, 'done'::public.processing_status, 'processing → done');
  perform tests.eq(v_row.processing_started_at, now(), 'a worker still reading the page keeps its claim');
  perform tests.eq((select count(*) from public.claim_link_processing(v_link)), 0::bigint, 'so nobody else can claim it');

  perform tests.throws(format($q$select public.set_link_categories(%L, '[{"name": "x", "slug": "-x-"}]')$q$, v_link),
    '23514', 'invalid slug rejected');
  perform tests.eq((select count(*) from public.link_categories where link_id = v_link), 1::bigint, 'and nothing changed');
  perform tests.throws(format($q$select public.set_link_categories(%L, '[]')$q$, gen_random_uuid()), 'P0002', 'unknown link');

  perform tests.logout();
end;
$$;

-- ─── add_link_tag ───────────────────────────────────────────────────────────
do $$
declare
  v_link uuid;
  v_tag record;
  v_again record;
begin
  perform tests.login('aaaaaaaa-5000-4000-8000-000000000001');
  v_link := tests.link('https://example.com/tagged', 'Tagged');

  select * into v_tag from public.add_link_tag(v_link, '  Long Reads ', 'long-reads');
  perform tests.eq(v_tag.name, 'Long Reads', 'returns the tag, trimmed');
  perform tests.eq(v_tag.slug, 'long-reads', 'returns the slug');
  perform tests.eq((select source from public.link_tags where link_id = v_link and tag_id = v_tag.id),
    'user'::public.assignment_source, 'user-sourced');

  select * into v_again from public.add_link_tag(v_link, 'long reads', 'long-reads');
  perform tests.eq(v_again.id, v_tag.id, 'idempotent: same tag');
  perform tests.eq(v_again.name, 'Long Reads', 'existing spelling wins');
  perform tests.eq((select count(*) from public.link_tags where link_id = v_link), 1::bigint, 'idempotent: one assignment');
  perform tests.eq((select count(*) from public.tags where slug = 'long-reads'), 1::bigint, 'idempotent: one tag');
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_link), 'Long Reads', 'search text follows');

  perform tests.throws(format($q$select * from public.add_link_tag(%L, 'Bad', 'bad slug')$q$, v_link), '23514', 'invalid slug');
  perform tests.throws(format($q$select * from public.add_link_tag(%L, '   ', 'blank')$q$, v_link), '23514', 'blank name');
  perform tests.throws(format($q$select * from public.add_link_tag(%L, 'x', 'x')$q$, gen_random_uuid()), 'P0002', 'unknown link');

  perform tests.logout();
end;
$$;

-- ─── merge_categories ───────────────────────────────────────────────────────
do $$
declare
  v_only_source uuid;
  v_both uuid;
  v_only_target uuid;
  v_neither uuid;
  v_source uuid;
  v_target uuid;
begin
  perform tests.login('aaaaaaaa-5000-4000-8000-000000000001');
  v_only_source := tests.link('https://example.com/m1', 'Only source');
  v_both := tests.link('https://example.com/m2', 'Both');
  v_only_target := tests.link('https://example.com/m3', 'Only target');
  v_neither := tests.link('https://example.com/m4', 'Neither');
  insert into public.categories (name, slug) values ('Crypto', 'crypto') returning id into v_source;
  insert into public.categories (name, slug) values ('Digital Money', 'digital-money') returning id into v_target;
  insert into public.link_categories (link_id, category_id, source) values
    (v_only_source, v_source, 'ai'), (v_both, v_source, 'ai'), (v_both, v_target, 'user'), (v_only_target, v_target, 'user');

  perform public.merge_categories(v_source, v_target);

  perform tests.eq((select count(*) from public.categories where id = v_source), 0::bigint, 'source removed');
  perform tests.eq((select array_agg(link_id order by link_id) from public.link_categories where category_id = v_target),
    tests.sorted(array[v_only_source, v_both, v_only_target]), 'every link now in the target, once');
  perform tests.eq((select source from public.link_categories where link_id = v_only_source),
    'ai'::public.assignment_source, 'moved assignment keeps its source');
  perform tests.eq((select source from public.link_categories where link_id = v_both),
    'user'::public.assignment_source, 'existing target assignment wins');
  perform tests.eq((select count(*) from public.link_categories where link_id = v_neither), 0::bigint, 'others untouched');
  perform tests.eq((select link_count from public.category_summaries() where id = v_target), 3::bigint, 'summary count');
  perform tests.eq(tests.sorted(tests.ids(format('public.list_links(p_category_id => %L)', v_target))),
    tests.sorted(array[v_only_target, v_both, v_only_source]), 'listed under the target');

  -- Merging a category into itself does nothing; unknown ids are not found.
  perform public.merge_categories(v_target, v_target);
  perform tests.eq((select count(*) from public.link_categories where category_id = v_target), 3::bigint, 'self-merge is a no-op');
  perform tests.throws(format('select public.merge_categories(%L, %L)', v_source, v_target), 'P0002', 'source already gone');
  perform tests.throws(format('select public.merge_categories(%L, %L)', v_target, gen_random_uuid()), 'P0002', 'unknown target');
  perform tests.throws(format('select public.merge_categories(null, %L)', v_target), 'P0002', 'null source');

  -- An empty source merges cleanly too.
  insert into public.categories (name, slug) values ('Empty', 'empty') returning id into v_source;
  perform public.merge_categories(v_source, v_target);
  perform tests.eq((select count(*) from public.categories where slug = 'empty'), 0::bigint, 'empty source removed');

  perform tests.logout();
end;
$$;

rollback;
