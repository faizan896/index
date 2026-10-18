-- list_links(): every filter alone and combined, every sort, pagination and
-- the limit clamp, the row shape, and search (stemming, prefixes, AND,
-- every searchable field, stop words, special characters, long input,
-- non-Latin text).
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-3000-4000-8000-000000000001', 'list-a@example.com'),
  ('cccccccc-3000-4000-8000-000000000003', 'list-c@example.com');

-- ─── Fixture: ten links with known dates, fields and terms ──────────────────
-- L01 … L10 are aaaaaaaa-3000-4000-8000-0000000000NN, created on 2026-01-(11 - NN).
do $$
begin
  perform tests.login('aaaaaaaa-3000-4000-8000-000000000001');

  insert into public.saved_links
    (id, url, normalized_url, domain, title, description, author, site_name, published_at, status, is_favorite, created_at)
  values
    ('aaaaaaaa-3000-4000-8000-000000000001', 'https://bank.example.com/future', 'https://bank.example.com/future', 'bank.example.com',
     'Banks and the future of money', 'Why central banks matter', 'Jane Doe', 'The Bank Journal', '2025-12-01', 'unread', false, '2026-01-10'),
    ('aaaaaaaa-3000-4000-8000-000000000002', 'https://coins.example.org/stable', 'https://coins.example.org/stable', 'coins.example.org',
     'Stablecoins explained', null, null, null, '2026-01-05', 'reading', true, '2026-01-09'),
    ('aaaaaaaa-3000-4000-8000-000000000003', 'https://zeta.example.net/x', 'https://zeta.example.net/x', 'zeta.example.net',
     null, null, null, null, null, 'finished', false, '2026-01-08'),
    ('aaaaaaaa-3000-4000-8000-000000000004', 'https://primer.example.com/p', 'https://primer.example.com/p', 'primer.example.com',
     'A banking primer', 'Learn how a bank works', null, null, '2024-06-01', 'unread', false, '2026-01-07'),
    ('aaaaaaaa-3000-4000-8000-000000000005', 'https://garden.example.com/start', 'https://garden.example.com/start', 'garden.example.com',
     'Gardening for beginners', null, 'Monty Don', null, null, 'unread', true, '2026-01-06'),
    ('aaaaaaaa-3000-4000-8000-000000000006', 'https://paris.example.fr/cafe', 'https://paris.example.fr/cafe', 'paris.example.fr',
     'Café culture in Paris', null, null, null, null, 'finished', false, '2026-01-05'),
    ('aaaaaaaa-3000-4000-8000-000000000007', 'https://nihon.example.jp/kiji', 'https://nihon.example.jp/kiji', 'nihon.example.jp',
     '日本語の記事', null, null, null, null, 'unread', false, '2026-01-04'),
    ('aaaaaaaa-3000-4000-8000-000000000008', 'https://odd.example.com/chars', 'https://odd.example.com/chars', 'odd.example.com',
     e'100% pure_data \\ backslash "quoted" it\'s', null, null, null, null, 'unread', false, '2026-01-03'),
    ('aaaaaaaa-3000-4000-8000-000000000009', 'https://stop.example.com/words', 'https://stop.example.com/words', 'stop.example.com',
     'The and of', null, null, null, null, 'unread', false, '2026-01-02'),
    ('aaaaaaaa-3000-4000-8000-000000000010', 'https://aaa.example.com/first', 'https://aaa.example.com/first', 'aaa.example.com',
     'alpha first', null, null, null, null, 'unread', false, '2026-01-01');

  insert into public.categories (id, name, slug) values
    ('aaaaaaaa-3000-4000-8000-0000000000c1', 'Finance', 'finance'),
    ('aaaaaaaa-3000-4000-8000-0000000000c2', 'Technology', 'technology'),
    ('aaaaaaaa-3000-4000-8000-0000000000c3', 'Hobbies', 'hobbies'),
    ('aaaaaaaa-3000-4000-8000-0000000000c4', 'Culture', 'culture');
  insert into public.link_categories (link_id, category_id) values
    ('aaaaaaaa-3000-4000-8000-000000000001', 'aaaaaaaa-3000-4000-8000-0000000000c1'),
    ('aaaaaaaa-3000-4000-8000-000000000002', 'aaaaaaaa-3000-4000-8000-0000000000c2'),
    ('aaaaaaaa-3000-4000-8000-000000000002', 'aaaaaaaa-3000-4000-8000-0000000000c1'),
    ('aaaaaaaa-3000-4000-8000-000000000004', 'aaaaaaaa-3000-4000-8000-0000000000c1'),
    ('aaaaaaaa-3000-4000-8000-000000000005', 'aaaaaaaa-3000-4000-8000-0000000000c3'),
    ('aaaaaaaa-3000-4000-8000-000000000006', 'aaaaaaaa-3000-4000-8000-0000000000c4');
  insert into public.tags (id, name, slug) values
    ('aaaaaaaa-3000-4000-8000-0000000000d1', 'Monetary Policy', 'monetary-policy'),
    ('aaaaaaaa-3000-4000-8000-0000000000d2', 'Crypto', 'crypto');
  insert into public.link_tags (link_id, tag_id) values
    ('aaaaaaaa-3000-4000-8000-000000000001', 'aaaaaaaa-3000-4000-8000-0000000000d1'),
    ('aaaaaaaa-3000-4000-8000-000000000002', 'aaaaaaaa-3000-4000-8000-0000000000d2');
  insert into public.collections (id, name) values ('aaaaaaaa-3000-4000-8000-0000000000e1', 'Reading list');
  insert into public.collection_links (collection_id, link_id) values
    ('aaaaaaaa-3000-4000-8000-0000000000e1', 'aaaaaaaa-3000-4000-8000-000000000001'),
    ('aaaaaaaa-3000-4000-8000-0000000000e1', 'aaaaaaaa-3000-4000-8000-000000000005');
  insert into public.notes (link_id, body) values
    ('aaaaaaaa-3000-4000-8000-000000000005', 'mulch and compost secrets'),
    ('aaaaaaaa-3000-4000-8000-000000000003', 'my garden plans');

  perform tests.logout();
end;
$$;

-- ─── Shape, filters, sorts, pagination ──────────────────────────────────────
do $$
declare
  l01 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000001';
  l02 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000002';
  l03 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000003';
  l04 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000004';
  l05 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000005';
  l06 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000006';
  l07 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000007';
  l08 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000008';
  l09 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000009';
  l10 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000010';
  finance constant uuid := 'aaaaaaaa-3000-4000-8000-0000000000c1';
  crypto constant uuid := 'aaaaaaaa-3000-4000-8000-0000000000d2';
  reading_list constant uuid := 'aaaaaaaa-3000-4000-8000-0000000000e1';
  v_recent uuid[];
  v_row record;
  v_paged uuid[] := '{}';
  v_offset int;
begin
  perform tests.login('aaaaaaaa-3000-4000-8000-000000000001');
  v_recent := array[l01, l02, l03, l04, l05, l06, l07, l08, l09, l10];

  -- Row shape.
  select * into v_row from public.list_links() where id = l02;
  perform tests.eq(v_row.url, 'https://coins.example.org/stable', 'url');
  perform tests.eq(v_row.status, 'reading'::public.reading_status, 'status');
  perform tests.eq(v_row.is_favorite, true, 'is_favorite');
  perform tests.eq(v_row.published_at, '2026-01-05'::timestamptz, 'published_at');
  perform tests.eq(v_row.metadata_status, 'pending'::public.processing_status, 'metadata_status');
  perform tests.eq(v_row.categories, jsonb_build_array(
      jsonb_build_object('id', finance, 'name', 'Finance', 'slug', 'finance'),
      jsonb_build_object('id', 'aaaaaaaa-3000-4000-8000-0000000000c2'::uuid, 'name', 'Technology', 'slug', 'technology')),
    'categories inline, sorted by name');
  perform tests.eq(v_row.tags, jsonb_build_array(jsonb_build_object('id', crypto, 'name', 'Crypto', 'slug', 'crypto')), 'tags inline');
  perform tests.eq(v_row.rank, 0::real, 'rank is 0 without a search');
  perform tests.eq(v_row.total_count, 10::bigint, 'total_count');
  select * into v_row from public.list_links() where id = l03;
  perform tests.eq(v_row.categories, '[]'::jsonb, 'no categories is an empty array');
  perform tests.eq(v_row.tags, '[]'::jsonb, 'no tags is an empty array');

  -- Default and explicit sorts.
  perform tests.eq(tests.ids('public.list_links()'), v_recent, 'default sort is most recent first');
  perform tests.eq(tests.ids($q$public.list_links(p_sort => 'recent')$q$), v_recent, 'recent');
  perform tests.eq(tests.ids($q$public.list_links(p_sort => 'oldest')$q$),
    array[l10, l09, l08, l07, l06, l05, l04, l03, l02, l01], 'oldest');
  perform tests.eq(tests.ids($q$public.list_links(p_sort => 'alpha')$q$),
    array[l08, l04, l10, l01, l06, l05, l02, l09, l03, l07], 'alpha, untitled links by their domain');
  perform tests.eq(tests.ids($q$public.list_links(p_sort => 'published')$q$),
    array[l02, l01, l04, l03, l05, l06, l07, l08, l09, l10], 'published, undated last (then most recent)');
  perform tests.eq(tests.ids($q$public.list_links(p_sort => 'relevance')$q$), v_recent, 'relevance without a query is recent');
  perform tests.eq(tests.ids($q$public.list_links(p_sort => 'bogus')$q$), v_recent, 'unknown sort is recent');
  perform tests.eq(tests.ids('public.list_links(p_sort => null)'), v_recent, 'null sort is recent');

  -- Filters, one at a time.
  perform tests.eq(tests.ids($q$public.list_links(p_status => 'unread')$q$), array[l01, l04, l05, l07, l08, l09, l10], 'unread');
  perform tests.eq(tests.ids($q$public.list_links(p_status => 'reading')$q$), array[l02], 'reading');
  perform tests.eq(tests.ids($q$public.list_links(p_status => 'finished')$q$), array[l03, l06], 'finished');
  perform tests.eq(tests.ids('public.list_links(p_favorite => true)'), array[l02, l05], 'favorites');
  perform tests.eq(tests.ids('public.list_links(p_favorite => false)'), array[l01, l03, l04, l06, l07, l08, l09, l10], 'not favorites');
  perform tests.eq(tests.ids(format('public.list_links(p_category_id => %L)', finance)), array[l01, l02, l04], 'category');
  perform tests.eq(tests.ids(format('public.list_links(p_tag_id => %L)', crypto)), array[l02], 'tag');
  perform tests.eq(tests.ids(format('public.list_links(p_collection_id => %L)', reading_list)), array[l01, l05], 'collection');
  perform tests.eq(tests.ids($q$public.list_links(p_domain => 'BANK.example.com')$q$), array[l01], 'domain, case-insensitive');
  perform tests.eq(tests.ids($q$public.list_links(p_domain => 'example.com')$q$), '{}'::uuid[], 'domain is exact, not a suffix');
  perform tests.eq(tests.ids('public.list_links(p_unsorted => true)'), array[l03, l07, l08, l09, l10], 'unsorted');
  perform tests.eq(tests.ids('public.list_links(p_unsorted => false)'), v_recent, 'unsorted false is no filter');
  perform tests.eq(tests.ids('public.list_links(p_unsorted => null)'), v_recent, 'unsorted null is no filter');
  perform tests.eq(tests.ids($q$public.list_links(p_saved_from => '2026-01-05', p_saved_to => '2026-01-08')$q$),
    array[l04, l05, l06], 'saved range: from inclusive, to exclusive');
  perform tests.eq(tests.ids($q$public.list_links(p_saved_from => '2026-01-09')$q$), array[l01, l02], 'saved from');
  perform tests.eq(tests.ids($q$public.list_links(p_saved_to => '2026-01-02')$q$), array[l10], 'saved to');
  perform tests.eq(tests.ids(format('public.list_links(p_category_id => %L)', gen_random_uuid())), '{}'::uuid[], 'unknown category');

  -- Filters combined.
  perform tests.eq(tests.ids($q$public.list_links(p_status => 'unread', p_favorite => true)$q$), array[l05], 'unread favorites');
  perform tests.eq(tests.ids(format($q$public.list_links(p_status => 'unread', p_category_id => %L)$q$, finance)),
    array[l01, l04], 'unread in a category');
  perform tests.eq(tests.ids(format($q$public.list_links(p_favorite => true, p_category_id => %L, p_tag_id => %L)$q$, finance, crypto)),
    array[l02], 'favorite + category + tag');
  perform tests.eq(tests.ids(format($q$public.list_links(p_collection_id => %L, p_status => 'unread', p_favorite => false)$q$, reading_list)),
    array[l01], 'collection + status + favorite');
  perform tests.eq(tests.ids($q$public.list_links(p_unsorted => true, p_saved_to => '2026-01-04')$q$), array[l08, l09, l10],
    'unsorted + date');
  perform tests.eq(tests.ids($q$public.list_links(p_unsorted => true, p_status => 'finished', p_sort => 'oldest')$q$), array[l03],
    'unsorted + status');
  perform tests.eq(tests.ids(format('public.list_links(p_unsorted => true, p_category_id => %L)', finance)), '{}'::uuid[],
    'unsorted + category is empty');
  perform tests.eq(tests.ids(format($q$public.list_links(p_category_id => %L, p_sort => 'alpha')$q$, finance)),
    array[l04, l01, l02], 'category sorted alphabetically');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'bank', p_status => 'unread')$q$), array[l01, l04], 'search + status');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'bank', p_favorite => true)$q$), '{}'::uuid[], 'search + favorite');
  perform tests.eq(tests.ids(format($q$public.list_links(p_query => 'stab', p_category_id => %L)$q$, finance)), array[l02],
    'search + category');
  perform tests.eq((select max(total_count) from public.list_links(p_status => 'unread', p_limit => 2)), 7::bigint,
    'total_count counts all filtered matches, not the page');

  -- Pagination: pages of 3 add up to the whole list, with a stable total.
  for v_offset in 0..9 by 3 loop
    for v_row in select * from public.list_links(p_limit => 3, p_offset => v_offset) loop
      perform tests.eq(v_row.total_count, 10::bigint, format('total_count on the page at offset %s', v_offset));
      v_paged := v_paged || v_row.id;
    end loop;
  end loop;
  perform tests.eq(v_paged, v_recent, 'pages of 3 concatenate to the full list');
  v_paged := '{}';
  for v_offset in 0..9 by 4 loop
    v_paged := v_paged || tests.ids(format($q$public.list_links(p_sort => 'alpha', p_limit => 4, p_offset => %s)$q$, v_offset));
  end loop;
  perform tests.eq(v_paged, tests.ids($q$public.list_links(p_sort => 'alpha')$q$), 'alpha pages concatenate in order');
  perform tests.eq((select count(*) from public.list_links(p_offset => 10)), 0::bigint, 'past the end is empty');
  perform tests.eq(tests.ids('public.list_links(p_limit => 3, p_offset => -5)'), array[l01, l02, l03], 'negative offset is 0');
  perform tests.eq(tests.ids('public.list_links(p_limit => 0)'), array[l01], 'limit below 1 is 1');
  perform tests.eq(tests.ids('public.list_links(p_limit => null, p_offset => null)'), v_recent, 'null limit/offset use defaults');

  perform tests.logout();
end;
$$;

-- The limit is clamped to 200 (with more rows than that available).
do $$
begin
  perform tests.login('cccccccc-3000-4000-8000-000000000003');
  insert into public.saved_links (url, normalized_url, domain, created_at)
  select 'https://c.example.com/' || n, 'https://c.example.com/' || n, 'c.example.com', '2026-01-01'::timestamptz + n * interval '1 minute'
  from generate_series(1, 205) n;
  perform tests.eq((select count(*) from public.list_links(p_limit => 500)), 200::bigint, 'limit clamped to 200');
  perform tests.eq((select max(total_count) from public.list_links(p_limit => 500)), 205::bigint, 'total beyond the clamp');
  perform tests.eq((select count(*) from public.list_links()), 50::bigint, 'default limit is 50');
  perform tests.eq((select count(*) from public.list_links(p_limit => 200, p_offset => 200)), 5::bigint, 'last page');
  perform tests.eq((select count(*) from public.list_links(p_limit => 2147483647)), 200::bigint, 'huge limit clamped');
  perform tests.eq((select count(*) from public.list_links(p_offset => 2147483647)), 0::bigint, 'huge offset is empty');
  perform tests.logout();
end;
$$;

-- ─── Search ─────────────────────────────────────────────────────────────────
do $$
declare
  l01 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000001';
  l02 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000002';
  l03 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000003';
  l04 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000004';
  l05 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000005';
  l06 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000006';
  l07 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000007';
  l08 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000008';
  l09 constant uuid := 'aaaaaaaa-3000-4000-8000-000000000009';
  v_case record;
  v_row record;
begin
  perform tests.login('aaaaaaaa-3000-4000-8000-000000000001');

  for v_case in
    select * from (values
      -- Stemming: "banking" and "bank" both reach "Banks", "banking" and "bank".
      ('banking', array[l01, l04], 'stemming'),
      ('bank', array[l01, l04], 'stem of a plural'),
      ('BANKS', array[l01, l04], 'case-insensitive'),
      -- Prefixes of the last (or any) word.
      ('stab', array[l02], 'prefix'),
      ('stablecoin', array[l02], 'singular of a compound plural'),
      ('gard', array[l03, l05], 'prefix across title and notes'),
      -- Several words must all match, in any field.
      ('bank future', array[l01], 'two words, AND'),
      ('future bank', array[l01], 'word order does not matter'),
      ('bank primer', array[l04], 'AND across title words'),
      ('bank compost', '{}'::uuid[], 'AND with no common link'),
      ('finance crypto', array[l02], 'AND across category and tag'),
      -- Every searchable field.
      ('central', array[l01], 'description'),
      ('jane', array[l01], 'author'),
      ('monty', array[l05], 'author (2)'),
      ('journal', array[l01], 'site name'),
      ('nihon', array[l07], 'domain'),
      ('example.org', array[l02], 'domain with its dot'),
      ('finance', array[l01, l02, l04], 'category'),
      ('hobbies', array[l05], 'category (stemmed)'),
      ('technology', array[l02], 'second category'),
      ('monetary', array[l01], 'tag'),
      ('monetary policy', array[l01], 'multi-word tag'),
      ('crypto', array[l02], 'tag (2)'),
      ('compost', array[l05], 'notes'),
      ('plans', array[l03], 'notes on an untitled link'),
      ('kiji', array[l07], 'url path, by substring'),
      ('coins', array[l02], 'domain word'),
      -- Stop words alone fall back to substring matching on title, domain and url.
      ('the', array[l01, l09], 'stop word falls back to substring'),
      ('  the  ', array[l01, l09], 'stop word with spaces'),
      ('and of', array[l09], 'only stop words: substring of the whole query'),
      -- Characters with meaning in tsquery or LIKE are plain text.
      ('%', array[l08], 'percent is literal'),
      ('_', array[l08], 'underscore is literal'),
      (e'\\', array[l08], 'backslash is literal'),
      ('"quoted"', array[l08], 'double quotes'),
      ('''', array[l08], 'single quote'),
      ('pure_data', array[l08], 'underscore inside a word'),
      ('100%', array[l08], 'number with percent'),
      ('):* <-> (', '{}'::uuid[], 'tsquery punctuation is not syntax'),
      ('%%%%', '{}'::uuid[], 'wildcards never match everything'),
      ('____', '{}'::uuid[], 'underscores never match everything'),
      (e'\\%', '{}'::uuid[], 'escaped wildcard stays literal'),
      ('[*]+?', '{}'::uuid[], 'regex characters are literal'),
      -- Non-Latin text.
      ('café', array[l06], 'accented word'),
      ('CAFÉ', array[l06], 'accented word, uppercase'),
      ('paris', array[l06], 'word after an accented one'),
      ('日本', array[l07], 'CJK prefix'),
      ('記事', array[l07], 'CJK substring of the title'),
      -- Whitespace-only queries are no search at all.
      ('   ', array[l01, l02, l03, l04, l05, l06, l07, l08, l09, 'aaaaaaaa-3000-4000-8000-000000000010'], 'blank query'),
      (e'\n\t', array[l01, l02, l03, l04, l05, l06, l07, l08, l09, 'aaaaaaaa-3000-4000-8000-000000000010'], 'whitespace query')
    ) as cases(query, expected, label)
  loop
    perform tests.eq(tests.sorted(tests.ids(format('public.list_links(p_query => %L)', v_case.query))),
      tests.sorted(v_case.expected), format('search %s: %s', v_case.label, v_case.query));
  end loop;

  -- tsquery operators in the input are ignored, not parsed.
  perform tests.eq(tests.sorted(tests.ids($q$public.list_links(p_query => '!b & (c | d:*)')$q$)),
    tests.sorted(tests.ids($q$public.list_links(p_query => 'b c d')$q$)), 'tsquery operators are plain text');
  perform tests.ok(cardinality(tests.ids($q$public.list_links(p_query => 'b c d')$q$)) > 0, 'single letters still prefix-match');

  -- Relevance: a title (and domain) match outranks a newer notes-only match.
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'garden')$q$), array[l03, l05], 'recent order for a search');
  perform tests.eq(tests.ids($q$public.list_links(p_query => 'garden', p_sort => 'relevance')$q$), array[l05, l03], 'relevance order');
  select * into v_row from public.list_links(p_query => 'garden', p_sort => 'relevance') limit 1;
  perform tests.ok(v_row.rank > 0, 'full-text matches carry a rank');
  perform tests.eq((select rank from public.list_links(p_query => 'kiji')), 0::real, 'substring-only matches rank 0');
  perform tests.eq((select max(total_count) from public.list_links(p_query => 'finance', p_limit => 1)), 3::bigint,
    'total_count of a search');

  -- Long input: many words (only the first 12 count) and one enormous word.
  perform tests.eq((select count(*) from public.list_links(p_query => repeat('lorem ipsum ', 5000))), 0::bigint, 'very long query');
  perform tests.eq((select count(*) from public.list_links(p_query => repeat('x', 100000))), 0::bigint, 'one enormous word');
  perform tests.eq((select count(*) from public.list_links(p_query => 'bank ' || repeat('q', 5000))), 0::bigint,
    'an enormous word still narrows the AND');
  perform tests.eq((select count(*) from public.list_links(p_query => repeat('bank ', 40))), 2::bigint, 'repeated word');
  perform tests.eq((select count(*) from public.list_links(p_query => repeat('日本', 3000))), 0::bigint, 'long CJK query');

  -- search_query() itself.
  perform tests.eq(public.search_query('Banking stab'), $q$'bank':* & 'stab':*$q$::tsquery, 'stemmed prefix terms');
  perform tests.ok(public.search_query('the of and') is null, 'stop words only gives null');
  perform tests.ok(public.search_query('') is null and public.search_query(null) is null and public.search_query('%_!') is null,
    'nothing searchable gives null');
  perform tests.eq(numnode(public.search_query('alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november')),
    23, 'at most 12 words (12 operands, 11 ANDs)');
  perform tests.eq(public.like_escape(e'50%_off\\'), e'50\\%\\_off\\\\', 'like_escape');

  perform tests.logout();
end;
$$;

rollback;
