-- Triggers: status/finished/favorite timestamps, updated_at, and the
-- denormalized search text (categories, tags, notes) staying current through
-- inserts, renames, merges, deletes and moves.
--
-- now() is fixed for the whole transaction, so "set to now()" is proven by
-- first parking a column at a sentinel date with the trigger off (as the
-- table owner, inside this transaction) and watching the trigger replace it.
begin;

insert into auth.users (id, email) values ('aaaaaaaa-4000-4000-8000-000000000001', 'triggers-a@example.com');

create function pg_temp.park(p_link uuid) returns void
language plpgsql
as $$
begin
  perform tests.logout();
  alter table public.saved_links disable trigger saved_links_before_write;
  update public.saved_links
  set status_changed_at = '2000-01-01', finished_at = case when finished_at is not null then '2000-01-01'::timestamptz end,
      favorited_at = case when favorited_at is not null then '2000-01-01'::timestamptz end, updated_at = '2000-01-01'
  where id = p_link;
  alter table public.saved_links enable trigger saved_links_before_write;
  perform tests.login('aaaaaaaa-4000-4000-8000-000000000001');
end;
$$;

-- ─── Reading status, favorites, updated_at ──────────────────────────────────
do $$
declare
  v_link uuid;
  v_row public.saved_links;
  sentinel constant timestamptz := '2000-01-01';
begin
  perform tests.login('aaaaaaaa-4000-4000-8000-000000000001');
  v_link := tests.link('https://example.com/status', 'Status test');
  select * into v_row from public.saved_links where id = v_link;
  perform tests.ok(v_row.status_changed_at is null and v_row.finished_at is null and v_row.favorited_at is null,
    'new unread link has no status timestamps');
  perform tests.eq(v_row.updated_at, now(), 'updated_at set on insert');

  perform pg_temp.park(v_link);
  update public.saved_links set title = 'Status test, renamed' where id = v_link;
  select * into v_row from public.saved_links where id = v_link;
  perform tests.eq(v_row.updated_at, now(), 'any update refreshes updated_at');
  perform tests.eq(v_row.status_changed_at, sentinel, 'status_changed_at untouched without a status change');

  update public.saved_links set status = 'reading' where id = v_link;
  select * into v_row from public.saved_links where id = v_link;
  perform tests.eq(v_row.status_changed_at, now(), 'unread → reading stamps status_changed_at');
  perform tests.ok(v_row.finished_at is null, 'reading has no finished_at');

  perform pg_temp.park(v_link);
  update public.saved_links set status = 'finished' where id = v_link;
  select * into v_row from public.saved_links where id = v_link;
  perform tests.eq(v_row.status_changed_at, now(), 'reading → finished stamps status_changed_at');
  perform tests.eq(v_row.finished_at, now(), 'finished stamps finished_at');

  perform pg_temp.park(v_link);
  update public.saved_links set status = 'finished' where id = v_link;
  select * into v_row from public.saved_links where id = v_link;
  perform tests.eq(v_row.finished_at, sentinel, 'setting the same status again keeps finished_at');
  perform tests.eq(v_row.status_changed_at, sentinel, 'and status_changed_at');

  update public.saved_links set status = 'unread' where id = v_link;
  select * into v_row from public.saved_links where id = v_link;
  perform tests.ok(v_row.finished_at is null, 'leaving finished clears finished_at');
  perform tests.eq(v_row.status_changed_at, now(), 'finished → unread stamps status_changed_at');

  update public.saved_links set is_favorite = true where id = v_link;
  perform tests.eq((select favorited_at from public.saved_links where id = v_link), now(), 'favoriting stamps favorited_at');
  perform pg_temp.park(v_link);
  update public.saved_links set is_favorite = true, title = 'Still a favorite' where id = v_link;
  perform tests.eq((select favorited_at from public.saved_links where id = v_link), sentinel, 'favoriting again keeps favorited_at');
  update public.saved_links set is_favorite = false where id = v_link;
  perform tests.ok((select favorited_at from public.saved_links where id = v_link) is null, 'unfavoriting clears favorited_at');

  -- Inserts that start past unread, or as a favorite (imports do this).
  insert into public.saved_links (url, normalized_url, domain, status, is_favorite)
  values ('https://example.com/done', 'https://example.com/done', 'example.com', 'finished', true)
  returning * into v_row;
  perform tests.eq(v_row.status_changed_at, now(), 'inserted finished: status_changed_at');
  perform tests.eq(v_row.finished_at, now(), 'inserted finished: finished_at');
  perform tests.eq(v_row.favorited_at, now(), 'inserted favorite: favorited_at');
  insert into public.saved_links (url, normalized_url, domain, status)
  values ('https://example.com/reading', 'https://example.com/reading', 'example.com', 'reading')
  returning * into v_row;
  perform tests.eq(v_row.status_changed_at, now(), 'inserted reading: status_changed_at');
  perform tests.ok(v_row.finished_at is null, 'inserted reading: no finished_at');
  insert into public.saved_links (url, normalized_url, domain, status, status_changed_at, finished_at, is_favorite, favorited_at)
  values ('https://example.com/kept', 'https://example.com/kept', 'example.com', 'finished', '2020-01-02', '2020-01-03', true, '2020-01-04')
  returning * into v_row;
  perform tests.eq(array[v_row.status_changed_at, v_row.finished_at, v_row.favorited_at],
    array['2020-01-02', '2020-01-03', '2020-01-04']::timestamptz[], 'explicit timestamps on insert are kept');
  insert into public.saved_links (url, normalized_url, domain, finished_at, favorited_at)
  values ('https://example.com/unread', 'https://example.com/unread', 'example.com', null, null)
  returning * into v_row;
  perform tests.ok(v_row.status_changed_at is null and v_row.favorited_at is null, 'plain unread insert stamps nothing');

  -- updated_at on the other tables: kept on insert, refreshed on update.
  insert into public.categories (name, slug, updated_at) values ('Dated', 'dated', sentinel);
  perform tests.eq((select updated_at from public.categories where slug = 'dated'), sentinel, 'category insert keeps updated_at');
  update public.categories set name = 'Dated too' where slug = 'dated';
  perform tests.eq((select updated_at from public.categories where slug = 'dated'), now(), 'category update refreshes updated_at');
  insert into public.collections (name, updated_at) values ('Dated', sentinel);
  update public.collections set description = 'x' where name = 'Dated';
  perform tests.eq((select updated_at from public.collections where name = 'Dated'), now(), 'collection update refreshes updated_at');
  insert into public.notes (link_id, body, updated_at) values (v_link, 'dated', sentinel);
  update public.notes set body = 'dated, edited' where link_id = v_link;
  perform tests.eq((select updated_at from public.notes where link_id = v_link), now(), 'note update refreshes updated_at');
  insert into public.user_settings (ai_enabled, updated_at) values (true, sentinel);
  update public.user_settings set ai_enabled = false;
  perform tests.eq((select updated_at from public.user_settings), now(), 'settings update refreshes updated_at');

  perform tests.logout();
end;
$$;

-- ─── The search vector ──────────────────────────────────────────────────────
do $$
declare
  v_link uuid;
  v_before tsvector;
begin
  perform tests.login('aaaaaaaa-4000-4000-8000-000000000001');
  v_link := tests.link('https://news.example.com/vector', 'Volcanoes erupting');
  select search_vector into v_before from public.saved_links where id = v_link;
  perform tests.ok(v_before @@ to_tsquery('english', 'volcano'), 'vector has the title');
  perform tests.ok(v_before @@ to_tsquery('english', 'news & example & com'), 'vector has the domain words');

  update public.saved_links set status = 'reading', is_favorite = true, processing_started_at = now() where id = v_link;
  perform tests.eq((select search_vector from public.saved_links where id = v_link), v_before, 'status updates keep the vector');

  update public.saved_links set search_vector = to_tsvector('simple', 'tampered') where id = v_link;
  perform tests.eq((select search_vector from public.saved_links where id = v_link), v_before, 'direct writes to the vector are ignored');
  update public.saved_links set search_vector = null where id = v_link;
  perform tests.eq((select search_vector from public.saved_links where id = v_link), v_before, 'nulling the vector is ignored');

  update public.saved_links set title = 'Glaciers melting' where id = v_link;
  perform tests.ok((select search_vector @@ to_tsquery('english', 'glacier') and not search_vector @@ to_tsquery('english', 'volcano')
    from public.saved_links where id = v_link), 'title change rebuilds the vector');
  update public.saved_links set description = 'About tectonics' where id = v_link;
  perform tests.ok((select search_vector @@ to_tsquery('english', 'tecton') from public.saved_links where id = v_link), 'description');
  update public.saved_links set author = 'Ada Lovelace' where id = v_link;
  perform tests.ok((select search_vector @@ to_tsquery('english', 'lovelac') from public.saved_links where id = v_link), 'author');
  update public.saved_links set site_name = 'Geology Weekly' where id = v_link;
  perform tests.ok((select search_vector @@ to_tsquery('english', 'geolog') from public.saved_links where id = v_link), 'site name');
  update public.saved_links set domain = 'quakes.example.org' where id = v_link;
  perform tests.ok((select search_vector @@ to_tsquery('english', 'quak') and not search_vector @@ to_tsquery('english', 'news')
    from public.saved_links where id = v_link), 'domain');
  update public.saved_links set title = null, description = null, author = null, site_name = null where id = v_link;
  perform tests.ok((select search_vector @@ to_tsquery('english', 'quak') and not search_vector @@ to_tsquery('english', 'glacier')
    from public.saved_links where id = v_link), 'cleared fields leave the vector');

  perform tests.logout();
end;
$$;

-- ─── Categories and tags in the search text ─────────────────────────────────
do $$
declare
  v_one uuid;
  v_two uuid;
  v_finance uuid;
  v_markets uuid;
  v_science uuid;
  v_tag uuid;
begin
  perform tests.login('aaaaaaaa-4000-4000-8000-000000000001');
  v_one := tests.link('https://example.com/tax-one', 'First');
  v_two := tests.link('https://example.com/tax-two', 'Second');
  insert into public.categories (name, slug) values ('Finance', 'finance') returning id into v_finance;
  insert into public.categories (name, slug) values ('Markets', 'markets') returning id into v_markets;
  insert into public.tags (name, slug) values ('Monetary Policy', 'monetary-policy') returning id into v_tag;

  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), '', 'starts empty');

  insert into public.link_categories (link_id, category_id) values (v_one, v_finance);
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Finance', 'category added');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'finance')$q$), array[v_one], 'searchable by category');

  insert into public.link_tags (link_id, tag_id) values (v_one, v_tag);
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Finance Monetary Policy', 'tag added');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'monetary')$q$), array[v_one], 'searchable by tag');

  update public.categories set name = 'Economics' where id = v_finance;
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Economics Monetary Policy', 'category renamed');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'economics')$q$), array[v_one], 'new category name searchable');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'finance')$q$), '{}'::uuid[], 'old category name gone');

  update public.tags set name = 'Interest Rates' where id = v_tag;
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Economics Interest Rates', 'tag renamed');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'interest rates')$q$), array[v_one], 'new tag name searchable');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'monetary')$q$), '{}'::uuid[], 'old tag name gone');

  update public.link_categories set category_id = v_markets where link_id = v_one and category_id = v_finance;
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Markets Interest Rates', 'assignment repointed');

  update public.link_tags set link_id = v_two where link_id = v_one and tag_id = v_tag;
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Markets', 'tag moved away');
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_two), 'Interest Rates', 'tag moved here');

  delete from public.link_categories where link_id = v_one;
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), '', 'category removed');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'markets')$q$), '{}'::uuid[], 'removed category not searchable');

  -- Merge: one link only in the source, one in both.
  insert into public.link_categories (link_id, category_id) values (v_one, v_finance), (v_two, v_finance), (v_two, v_markets);
  perform public.merge_categories(v_finance, v_markets);
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Markets', 'merge: source replaced by target');
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_two), 'Markets Interest Rates', 'merge: no duplicate name');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'economics')$q$), '{}'::uuid[], 'merged-away name not searchable');

  -- Deleting a category or tag clears it from every link, and keeps the links.
  delete from public.categories where id = v_markets;
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), '', 'category deleted');
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_two), 'Interest Rates', 'category deleted (2)');
  delete from public.tags where id = v_tag;
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_two), '', 'tag deleted');
  perform tests.eq((select count(*) from public.saved_links where id in (v_one, v_two)), 2::bigint, 'links survive');
  perform tests.ok((select search_vector @@ to_tsquery('english', 'first') from public.saved_links where id = v_one),
    'vector still has the title');

  -- A slug-only change (no rename) and a no-op refresh rewrite nothing.
  insert into public.categories (name, slug) values ('Science', 'science') returning id into v_science;
  insert into public.link_categories (link_id, category_id) values (v_one, v_science);
  perform pg_temp.park(v_one);
  update public.categories set slug = 'sciences' where slug = 'science';
  perform public.refresh_link_taxonomy(v_one);
  perform public.refresh_link_notes(v_one);
  perform tests.eq((select updated_at from public.saved_links where id = v_one), '2000-01-01'::timestamptz,
    'refreshing unchanged text does not rewrite the link');
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Science', 'slug change keeps the text');

  -- One statement touching several rows of several links refreshes each link.
  insert into public.categories (name, slug) values ('Alpha', 'alpha'), ('Beta', 'beta');
  insert into public.link_categories (link_id, category_id)
  select l.id, c.id from public.saved_links l, public.categories c
  where l.id in (v_one, v_two) and c.slug in ('alpha', 'beta') and not (l.id = v_two and c.slug = 'beta');
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Alpha Beta Science', 'bulk insert (1)');
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_two), 'Alpha', 'bulk insert (2)');
  delete from public.link_categories where category_id in (select id from public.categories where slug in ('alpha', 'beta'));
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Science', 'bulk delete (1)');
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_two), '', 'bulk delete (2)');
  insert into public.link_categories (link_id, category_id) values (v_one, v_science) on conflict do nothing;
  perform tests.eq((select taxonomy_text from public.saved_links where id = v_one), 'Science', 'an insert that inserts nothing');

  perform tests.logout();
end;
$$;

-- ─── Notes in the search text ───────────────────────────────────────────────
do $$
declare
  v_one uuid;
  v_two uuid;
  v_first uuid;
  v_second uuid;
begin
  perform tests.login('aaaaaaaa-4000-4000-8000-000000000001');
  v_one := tests.link('https://example.com/notes-one', 'Notes one');
  v_two := tests.link('https://example.com/notes-two', 'Notes two');

  insert into public.notes (link_id, body, created_at) values (v_one, 'remember the aardvark', '2026-01-02') returning id into v_first;
  perform tests.eq((select notes_text from public.saved_links where id = v_one), 'remember the aardvark', 'note added');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'aardvark')$q$), array[v_one], 'searchable by note');

  insert into public.notes (link_id, body, created_at) values (v_one, 'zebra crossing', '2026-01-01') returning id into v_second;
  perform tests.eq((select notes_text from public.saved_links where id = v_one), 'zebra crossing remember the aardvark',
    'notes joined oldest first');

  update public.notes set body = 'remember the anteater' where id = v_first;
  perform tests.eq((select notes_text from public.saved_links where id = v_one), 'zebra crossing remember the anteater', 'note edited');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'aardvark')$q$), '{}'::uuid[], 'edited-away word gone');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'anteater')$q$), array[v_one], 'edited word searchable');

  update public.notes set link_id = v_two where id = v_second;
  perform tests.eq((select notes_text from public.saved_links where id = v_one), 'remember the anteater', 'note moved away');
  perform tests.eq((select notes_text from public.saved_links where id = v_two), 'zebra crossing', 'note moved here');

  delete from public.notes where id = v_first;
  perform tests.eq((select notes_text from public.saved_links where id = v_one), '', 'note deleted');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'anteater')$q$), '{}'::uuid[], 'deleted note not searchable');

  -- The search text is capped at 20,000 characters however long the notes.
  insert into public.notes (link_id, body) values (v_one, repeat('a', 15000)), (v_one, repeat('b', 15000));
  perform tests.eq((select char_length(notes_text) from public.saved_links where id = v_one), 20000, 'notes text capped');

  -- Deleting the link takes its notes, assignments and collection entries with it.
  insert into public.collections (name) values ('Doomed');
  insert into public.collection_links (collection_id, link_id) select id, v_one from public.collections where name = 'Doomed';
  delete from public.saved_links where id = v_one;
  perform tests.eq((select count(*) from public.notes where link_id = v_one), 0::bigint, 'notes cascade');
  perform tests.eq((select count(*) from public.collection_links where link_id = v_one), 0::bigint, 'collection entries cascade');
  perform tests.eq((select count(*) from public.collections where name = 'Doomed'), 1::bigint, 'the collection stays');

  perform tests.logout();
end;
$$;

rollback;
