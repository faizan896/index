-- Access control: row-level security on every table and operation, the
-- composite foreign keys between users, what anonymous visitors can reach,
-- every function called with another user's ids, and schema-wide rules
-- (RLS on, no anon privileges, no TRUNCATE, pinned search_path, invoker rights).
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-1000-4000-8000-000000000001', 'access-a@example.com'),
  ('bbbbbbbb-1000-4000-8000-000000000002', 'access-b@example.com');

-- ─── Fixtures: one of everything for A and for B ────────────────────────────
-- Ids follow one pattern: aaaaaaaa-1000-4000-8000-0000000000a1 is A's link,
-- …a2 its category, …a3 its tag, …a4 its collection, …a5 its note; same for b.
do $$
declare
  v_who text;
  v_link uuid;
begin
  foreach v_who in array array['a', 'b'] loop
    perform tests.login(format('%s-1000-4000-8000-00000000000%s', repeat(v_who, 8), case v_who when 'a' then 1 else 2 end)::uuid);
    v_link := format('%s-1000-4000-8000-0000000000%s1', repeat(v_who, 8), v_who)::uuid;

    insert into public.user_settings (ai_enabled) values (v_who = 'a');
    insert into public.saved_links (id, url, normalized_url, domain, title)
    values (v_link, format('https://%s.example.com/secret', v_who), format('https://%s.example.com/secret', v_who),
            format('%s.example.com', v_who), 'Secret of ' || upper(v_who));
    insert into public.categories (id, name, slug)
    values (format('%s-1000-4000-8000-0000000000%s2', repeat(v_who, 8), v_who)::uuid, 'Category ' || upper(v_who), 'category-' || v_who);
    insert into public.tags (id, name, slug)
    values (format('%s-1000-4000-8000-0000000000%s3', repeat(v_who, 8), v_who)::uuid, 'Tag ' || upper(v_who), 'tag-' || v_who);
    insert into public.collections (id, name)
    values (format('%s-1000-4000-8000-0000000000%s4', repeat(v_who, 8), v_who)::uuid, 'Collection ' || upper(v_who));
    insert into public.link_categories (link_id, category_id)
    values (v_link, format('%s-1000-4000-8000-0000000000%s2', repeat(v_who, 8), v_who)::uuid);
    insert into public.link_tags (link_id, tag_id)
    values (v_link, format('%s-1000-4000-8000-0000000000%s3', repeat(v_who, 8), v_who)::uuid);
    insert into public.collection_links (collection_id, link_id)
    values (format('%s-1000-4000-8000-0000000000%s4', repeat(v_who, 8), v_who)::uuid, v_link);
    insert into public.notes (id, link_id, body)
    values (format('%s-1000-4000-8000-0000000000%s5', repeat(v_who, 8), v_who)::uuid, v_link, 'Private note of ' || upper(v_who));
    insert into public.classification_cache (cache_key, model, result)
    values ('cache-key-' || v_who || '-0123456789', 'model', '{"categories": []}');

    perform tests.logout();
  end loop;
end;
$$;

-- ─── B against A's rows, table by table ─────────────────────────────────────
do $$
declare
  a constant uuid := 'aaaaaaaa-1000-4000-8000-000000000001';
  b constant uuid := 'bbbbbbbb-1000-4000-8000-000000000002';
  v_table text;
  v_tables constant text[] := array[
    'user_settings', 'saved_links', 'categories', 'link_categories', 'tags', 'link_tags',
    'collections', 'collection_links', 'notes', 'classification_cache'];
begin
  perform tests.login(b);

  foreach v_table in array v_tables loop
    perform tests.eq(tests.value(format('select count(*) from public.%I where user_id = %L', v_table, a)), '0',
      format('B sees none of A''s %s', v_table));
    perform tests.eq(tests.value(format('select count(*) from public.%I where user_id <> %L', v_table, b)), '0',
      format('B sees only its own %s', v_table));
    perform tests.ok(tests.value(format('select count(*) from public.%I', v_table))::int > 0,
      format('B sees its own %s', v_table));
    perform tests.eq(tests.affected(format('update public.%I set user_id = user_id where user_id = %L', v_table, a)), 0::bigint,
      format('B updates none of A''s %s', v_table));
    perform tests.eq(tests.affected(format('delete from public.%I where user_id = %L', v_table, a)), 0::bigint,
      format('B deletes none of A''s %s', v_table));
    perform tests.throws(format('update public.%I set user_id = %L', v_table, a), '42501',
      format('B cannot hand its %s to A', v_table), '%row-level security%');
  end loop;

  -- Targeting A's rows by primary key changes nothing either.
  perform tests.eq(tests.affected($q$update public.saved_links set title = 'pwned', status = 'finished'
    where id = 'aaaaaaaa-1000-4000-8000-0000000000a1'$q$), 0::bigint, 'B cannot update A''s link by id');
  perform tests.eq(tests.affected($q$delete from public.saved_links where id = 'aaaaaaaa-1000-4000-8000-0000000000a1'$q$),
    0::bigint, 'B cannot delete A''s link by id');
  perform tests.eq(tests.affected($q$update public.categories set name = 'pwned' where id = 'aaaaaaaa-1000-4000-8000-0000000000a2'$q$),
    0::bigint, 'B cannot rename A''s category');
  perform tests.eq(tests.affected($q$update public.notes set body = 'pwned' where id = 'aaaaaaaa-1000-4000-8000-0000000000a5'$q$),
    0::bigint, 'B cannot edit A''s note');
  perform tests.eq(tests.affected($q$delete from public.collections where id = 'aaaaaaaa-1000-4000-8000-0000000000a4'$q$),
    0::bigint, 'B cannot delete A''s collection');

  -- Inserting rows that claim to be A's.
  perform tests.throws(format('insert into public.user_settings (user_id) values (%L)', a), '42501', 'settings as A', '%row-level security%');
  perform tests.throws(format($q$insert into public.saved_links (user_id, url, normalized_url, domain)
    values (%L, 'https://x.example/1', 'https://x.example/1', 'x.example')$q$, a), '42501', 'link as A', '%row-level security%');
  perform tests.throws(format($q$insert into public.categories (user_id, name, slug) values (%L, 'X', 'x')$q$, a),
    '42501', 'category as A', '%row-level security%');
  perform tests.throws(format($q$insert into public.tags (user_id, name, slug) values (%L, 'X', 'x')$q$, a),
    '42501', 'tag as A', '%row-level security%');
  perform tests.throws(format($q$insert into public.collections (user_id, name) values (%L, 'X')$q$, a),
    '42501', 'collection as A', '%row-level security%');
  perform tests.throws(format($q$insert into public.link_categories (user_id, link_id, category_id)
    values (%L, 'aaaaaaaa-1000-4000-8000-0000000000a1', 'aaaaaaaa-1000-4000-8000-0000000000a2')$q$, a),
    '42501', 'link category as A', '%row-level security%');
  perform tests.throws(format($q$insert into public.link_tags (user_id, link_id, tag_id)
    values (%L, 'aaaaaaaa-1000-4000-8000-0000000000a1', 'aaaaaaaa-1000-4000-8000-0000000000a3')$q$, a),
    '42501', 'link tag as A', '%row-level security%');
  perform tests.throws(format($q$insert into public.collection_links (user_id, collection_id, link_id)
    values (%L, 'aaaaaaaa-1000-4000-8000-0000000000a4', 'aaaaaaaa-1000-4000-8000-0000000000a1')$q$, a),
    '42501', 'collection link as A', '%row-level security%');
  perform tests.throws(format($q$insert into public.notes (user_id, link_id, body)
    values (%L, 'aaaaaaaa-1000-4000-8000-0000000000a1', 'x')$q$, a), '42501', 'note as A', '%row-level security%');
  perform tests.throws(format($q$insert into public.classification_cache (user_id, cache_key, model, result)
    values (%L, 'cache-key-x-0123456789', 'm', '{}')$q$, a), '42501', 'cache as A', '%row-level security%');

  -- Composite foreign keys: B's rows can't point at A's, in either direction.
  perform tests.throws($q$insert into public.link_categories (link_id, category_id)
    values ('bbbbbbbb-1000-4000-8000-0000000000b1', 'aaaaaaaa-1000-4000-8000-0000000000a2')$q$,
    '23503', 'A''s category on B''s link');
  perform tests.throws($q$insert into public.link_categories (link_id, category_id)
    values ('aaaaaaaa-1000-4000-8000-0000000000a1', 'bbbbbbbb-1000-4000-8000-0000000000b2')$q$,
    '23503', 'B''s category on A''s link');
  perform tests.throws($q$insert into public.link_tags (link_id, tag_id)
    values ('bbbbbbbb-1000-4000-8000-0000000000b1', 'aaaaaaaa-1000-4000-8000-0000000000a3')$q$,
    '23503', 'A''s tag on B''s link');
  perform tests.throws($q$insert into public.link_tags (link_id, tag_id)
    values ('aaaaaaaa-1000-4000-8000-0000000000a1', 'bbbbbbbb-1000-4000-8000-0000000000b3')$q$,
    '23503', 'B''s tag on A''s link');
  perform tests.throws($q$insert into public.collection_links (collection_id, link_id)
    values ('aaaaaaaa-1000-4000-8000-0000000000a4', 'bbbbbbbb-1000-4000-8000-0000000000b1')$q$,
    '23503', 'B''s link in A''s collection');
  perform tests.throws($q$insert into public.collection_links (collection_id, link_id)
    values ('bbbbbbbb-1000-4000-8000-0000000000b4', 'aaaaaaaa-1000-4000-8000-0000000000a1')$q$,
    '23503', 'A''s link in B''s collection');
  perform tests.throws($q$insert into public.notes (link_id, body) values ('aaaaaaaa-1000-4000-8000-0000000000a1', 'hello')$q$,
    '23503', 'a note on A''s link');
  perform tests.throws($q$update public.link_categories set category_id = 'aaaaaaaa-1000-4000-8000-0000000000a2'
    where link_id = 'bbbbbbbb-1000-4000-8000-0000000000b1'$q$, '23503', 'repointing B''s assignment at A''s category');
  perform tests.throws($q$update public.notes set link_id = 'aaaaaaaa-1000-4000-8000-0000000000a1'
    where id = 'bbbbbbbb-1000-4000-8000-0000000000b5'$q$, '23503', 'moving B''s note onto A''s link');

  -- B can't truncate (TRUNCATE ignores row-level security).
  foreach v_table in array v_tables loop
    perform tests.throws(format('truncate public.%I cascade', v_table), '42501', format('B cannot truncate %s', v_table));
  end loop;

  perform tests.logout();
end;
$$;

-- ─── B calling every function with A's ids ──────────────────────────────────
do $$
declare
  a constant uuid := 'aaaaaaaa-1000-4000-8000-000000000001';
  b constant uuid := 'bbbbbbbb-1000-4000-8000-000000000002';
  a_link constant uuid := 'aaaaaaaa-1000-4000-8000-0000000000a1';
  a_category constant uuid := 'aaaaaaaa-1000-4000-8000-0000000000a2';
  a_tag constant uuid := 'aaaaaaaa-1000-4000-8000-0000000000a3';
  a_collection constant uuid := 'aaaaaaaa-1000-4000-8000-0000000000a4';
  b_link constant uuid := 'bbbbbbbb-1000-4000-8000-0000000000b1';
  b_category constant uuid := 'bbbbbbbb-1000-4000-8000-0000000000b2';
  v_json jsonb;
  v_saved record;
begin
  perform tests.login(b);

  perform tests.eq((select count(*) from public.related_links(a_link)), 0::bigint, 'related_links of A''s link is empty');
  perform tests.throws(format($q$select public.apply_classification(%L, '[{"name":"Pwned","slug":"pwned"}]', '[]')$q$, a_link),
    'P0002', 'apply_classification on A''s link', 'link not found');
  perform tests.throws(format($q$select public.set_link_categories(%L, '[{"name":"Pwned","slug":"pwned"}]')$q$, a_link),
    'P0002', 'set_link_categories on A''s link', 'link not found');
  perform tests.throws(format($q$select * from public.add_link_tag(%L, 'Pwned', 'pwned')$q$, a_link),
    'P0002', 'add_link_tag on A''s link', 'link not found');
  perform tests.throws(format('select public.merge_categories(%L, %L)', a_category, b_category),
    'P0002', 'merging A''s category into B''s', 'category not found');
  perform tests.throws(format('select public.merge_categories(%L, %L)', b_category, a_category),
    'P0002', 'merging B''s category into A''s', 'category not found');
  perform public.merge_categories(a_category, a_category); -- same id: a no-op, not an error
  perform tests.eq((select count(*) from public.claim_link_processing(a_link)), 0::bigint, 'claiming A''s link');
  perform tests.eq((select count(*) from public.claim_link_processing(a_link, true)), 0::bigint, 'force-claiming A''s link');
  perform tests.eq((select count(*) from public.list_links(p_category_id => a_category)), 0::bigint, 'list by A''s category');
  perform tests.eq((select count(*) from public.list_links(p_tag_id => a_tag)), 0::bigint, 'list by A''s tag');
  perform tests.eq((select count(*) from public.list_links(p_collection_id => a_collection)), 0::bigint, 'list by A''s collection');
  perform tests.eq((select count(*) from public.list_links(p_query => 'Secret')), 1::bigint, 'search finds only B''s link');
  perform tests.eq((select id from public.list_links(p_query => 'Secret')), b_link, 'search returns B''s link');
  perform tests.eq((select count(*) from public.list_links(p_domain => 'a.example.com')), 0::bigint, 'list by A''s domain');
  perform tests.ok(not exists (select 1 from public.list_links() where id = a_link), 'list_links never shows A''s link');
  perform tests.ok(not exists (select 1 from public.rediscover('x') where id = a_link), 'rediscover never shows A''s link');
  perform tests.eq((select count(*) from public.get_link_item(a_link)), 0::bigint, 'get_link_item of A''s link');
  perform tests.ok(public.link_detail(a_link) is null, 'link_detail of A''s link');

  v_json := public.export_library();
  perform tests.eq(jsonb_array_length(v_json->'links'), 1, 'export has only B''s link');
  perform tests.ok(v_json::text not like '%a.example.com%' and v_json::text not like '%Category A%'
    and v_json::text not like '%Private note of A%' and v_json::text not like '%Collection A%'
    and v_json::text not like '%Tag A%', 'export leaks nothing of A');

  v_json := public.library_stats();
  perform tests.eq(v_json, jsonb_build_object('total', 1, 'unread', 1, 'reading', 0, 'finished', 0, 'favorites', 0,
    'unsorted', 0, 'pending', 1, 'categories', 1, 'collections', 1), 'library_stats counts only B');
  perform tests.eq((select array_agg(id) from public.category_summaries()), array[b_category], 'category_summaries');
  perform tests.eq((select array_agg(name) from public.collection_summaries()), array['Collection B'], 'collection_summaries');
  perform tests.eq((select array_agg(domain) from public.source_summaries()), array['b.example.com'], 'source_summaries');

  -- Saving or importing A's URL gives B its own copy, never A's row.
  select * into v_saved from public.save_link('https://a.example.com/secret', 'https://a.example.com/secret', 'a.example.com');
  perform tests.ok(v_saved.link_id <> a_link and not v_saved.duplicate, 'save_link of A''s URL creates B''s own row');
  perform tests.eq(public.import_links('[{"url":"https://a.example.com/other","normalized_url":"https://a.example.com/other","domain":"a.example.com"}]'),
    '{"imported": 1, "duplicates": 0}'::jsonb, 'import of a URL A also has');

  -- The search-text refreshers are callable but can't touch A's row.
  perform public.refresh_link_taxonomy(a_link);
  perform public.refresh_links_taxonomy(array[a_link, b_link]);
  perform public.refresh_link_notes(a_link);

  perform tests.logout();

  -- A's data is exactly as it was.
  perform tests.eq((select title from public.saved_links where id = a_link), 'Secret of A', 'A''s title untouched');
  perform tests.eq((select status from public.saved_links where id = a_link), 'unread'::public.reading_status, 'A''s status untouched');
  perform tests.eq((select metadata_status from public.saved_links where id = a_link), 'pending'::public.processing_status,
    'A''s link was never claimed');
  perform tests.eq((select taxonomy_text from public.saved_links where id = a_link), 'Category A Tag A', 'A''s taxonomy untouched');
  perform tests.eq((select notes_text from public.saved_links where id = a_link), 'Private note of A', 'A''s notes untouched');
  perform tests.eq((select name from public.categories where id = a_category), 'Category A', 'A''s category untouched');
  perform tests.eq((select count(*) from public.categories where user_id = a), 1::bigint, 'nothing created for A');
  perform tests.eq((select count(*) from public.tags where user_id = a), 1::bigint, 'no tags created for A');
  perform tests.eq((select count(*) from public.link_categories where user_id = a), 1::bigint, 'A''s assignments intact');
  perform tests.eq((select count(*) from public.saved_links where user_id = a), 1::bigint, 'A has one link');
  perform tests.eq((select count(*) from public.notes where user_id = a), 1::bigint, 'A''s note intact');
  perform tests.eq((select count(*) from public.collection_links where user_id = a), 1::bigint, 'A''s collection intact');
  perform tests.eq((select ai_enabled from public.user_settings where user_id = a), true, 'A''s settings intact');
end;
$$;

-- ─── Anonymous visitors ─────────────────────────────────────────────────────
do $$
declare
  v_table text;
  v_call text;
begin
  perform tests.login_anon();

  foreach v_table in array array[
    'user_settings', 'saved_links', 'categories', 'link_categories', 'tags', 'link_tags',
    'collections', 'collection_links', 'notes', 'classification_cache'] loop
    perform tests.throws(format('select count(*) from public.%I', v_table), '42501', format('anon select %s', v_table));
    perform tests.throws(format('insert into public.%I default values', v_table), '42501', format('anon insert %s', v_table));
    perform tests.throws(format('update public.%I set user_id = user_id', v_table), '42501', format('anon update %s', v_table));
    perform tests.throws(format('delete from public.%I', v_table), '42501', format('anon delete %s', v_table));
    perform tests.throws(format('truncate public.%I cascade', v_table), '42501', format('anon truncate %s', v_table));
  end loop;

  foreach v_call in array array[
    $q$select public.save_link('https://x.example', 'https://x.example', 'x.example')$q$,
    'select * from public.list_links()',
    'select public.library_stats()',
    'select * from public.category_summaries()',
    'select * from public.collection_summaries()',
    'select * from public.source_summaries()',
    $q$select public.apply_classification('aaaaaaaa-1000-4000-8000-0000000000a1', '[]', '[]')$q$,
    $q$select public.set_link_categories('aaaaaaaa-1000-4000-8000-0000000000a1', '[]')$q$,
    $q$select * from public.add_link_tag('aaaaaaaa-1000-4000-8000-0000000000a1', 'x', 'x')$q$,
    $q$select public.merge_categories('aaaaaaaa-1000-4000-8000-0000000000a2', 'bbbbbbbb-1000-4000-8000-0000000000b2')$q$,
    $q$select * from public.related_links('aaaaaaaa-1000-4000-8000-0000000000a1')$q$,
    'select * from public.rediscover()',
    $q$select public.import_links('[]')$q$,
    'select public.export_library()',
    $q$select * from public.claim_link_processing('aaaaaaaa-1000-4000-8000-0000000000a1')$q$,
    $q$select * from public.get_link_item('aaaaaaaa-1000-4000-8000-0000000000a1')$q$,
    $q$select public.link_detail('aaaaaaaa-1000-4000-8000-0000000000a1')$q$,
    $q$select public.refresh_link_taxonomy('aaaaaaaa-1000-4000-8000-0000000000a1')$q$,
    $q$select public.refresh_links_taxonomy('{aaaaaaaa-1000-4000-8000-0000000000a1}')$q$,
    $q$select public.refresh_link_notes('aaaaaaaa-1000-4000-8000-0000000000a1')$q$,
    $q$select public.search_query('x')$q$,
    $q$select public.like_escape('x')$q$] loop
    perform tests.throws(v_call, '42501', 'anon: ' || v_call, 'permission denied%');
  end loop;

  perform tests.logout();
end;
$$;

-- ─── Schema-wide rules, so new tables and functions inherit them ────────────
do $$
declare
  v_row record;
begin
  for v_row in
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
  loop
    perform tests.ok(v_row.relrowsecurity, format('row-level security is on for %s', v_row.relname));
    perform tests.ok(not has_table_privilege('anon', v_row.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
      format('anon has no privilege on %s', v_row.relname));
    perform tests.ok(has_table_privilege('authenticated', v_row.oid, 'SELECT')
      and has_table_privilege('authenticated', v_row.oid, 'INSERT')
      and has_table_privilege('authenticated', v_row.oid, 'UPDATE')
      and has_table_privilege('authenticated', v_row.oid, 'DELETE'),
      format('authenticated can use %s', v_row.relname));
    perform tests.ok(not has_table_privilege('authenticated', v_row.oid, 'TRUNCATE, REFERENCES, TRIGGER'),
      format('authenticated has no TRUNCATE/REFERENCES/TRIGGER on %s', v_row.relname));
    perform tests.ok(exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = v_row.relname),
      format('%s has a policy', v_row.relname));
  end loop;

  for v_row in
    select p.oid, p.oid::regprocedure::text as signature, p.prosecdef, p.proconfig, p.prorettype
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
  loop
    perform tests.ok(not has_function_privilege('anon', v_row.oid, 'EXECUTE'),
      format('anon cannot execute %s', v_row.signature));
    perform tests.ok(not v_row.prosecdef, format('%s is security invoker', v_row.signature));
    perform tests.ok('search_path=""' = any(coalesce(v_row.proconfig, '{}')),
      format('%s pins search_path to empty (proconfig %s)', v_row.signature, v_row.proconfig));
    if v_row.prorettype <> 'trigger'::regtype then
      perform tests.ok(has_function_privilege('authenticated', v_row.oid, 'EXECUTE'),
        format('authenticated can execute %s', v_row.signature));
    end if;
  end loop;

  -- Every RLS policy compares user_id with the caller (no other predicate can widen it).
  perform tests.eq((select count(*) from pg_policies where schemaname = 'public'
    and (qual is distinct from '(user_id = ( SELECT auth.uid() AS uid))'
      or with_check is distinct from '(user_id = ( SELECT auth.uid() AS uid))'
      or roles <> '{authenticated}')), 0::bigint, 'all policies are owner-only for authenticated');
end;
$$;

-- ─── Deleting an account removes everything it owned, and nothing else ──────
do $$
begin
  delete from auth.users where id = 'aaaaaaaa-1000-4000-8000-000000000001';
  perform tests.eq((select count(*) from public.saved_links where user_id = 'aaaaaaaa-1000-4000-8000-000000000001'), 0::bigint, 'links gone');
  perform tests.eq((select count(*) from public.categories where user_id = 'aaaaaaaa-1000-4000-8000-000000000001'), 0::bigint, 'categories gone');
  perform tests.eq((select count(*) from public.notes where user_id = 'aaaaaaaa-1000-4000-8000-000000000001'), 0::bigint, 'notes gone');
  perform tests.eq((select count(*) from public.link_tags where user_id = 'aaaaaaaa-1000-4000-8000-000000000001'), 0::bigint, 'link tags gone');
  perform tests.eq((select count(*) from public.classification_cache where user_id = 'aaaaaaaa-1000-4000-8000-000000000001'), 0::bigint, 'cache gone');
  perform tests.eq((select count(*) from public.user_settings where user_id = 'aaaaaaaa-1000-4000-8000-000000000001'), 0::bigint, 'settings gone');
  perform tests.eq((select taxonomy_text from public.saved_links where id = 'bbbbbbbb-1000-4000-8000-0000000000b1'),
    'Category B Tag B', 'B''s link untouched');
  perform tests.eq((select count(*) from public.saved_links where user_id = 'bbbbbbbb-1000-4000-8000-000000000002'), 3::bigint,
    'B keeps its links');
end;
$$;

rollback;
