-- related_links() scoring, threshold, limits and isolation; rediscover()
-- picks, determinism and edge cases.
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-6000-4000-8000-000000000001', 'related-a@example.com'),
  ('bbbbbbbb-6000-4000-8000-000000000002', 'related-b@example.com'),
  ('cccccccc-6000-4000-8000-000000000003', 'related-c@example.com'),
  ('dddddddd-6000-4000-8000-000000000004', 'rediscover-d@example.com'),
  ('eeeeeeee-6000-4000-8000-000000000005', 'rediscover-e@example.com');

-- ─── related_links ──────────────────────────────────────────────────────────
-- A's library of 14 links around a target T:
--   "Everything" is on 13 of 14 links (all but Z): idf weight ln(1 + 14/13) ≈ 0.73, below the 0.75 bar alone.
--   "Finance" is on 5 (T, Y, F1–F3): ln(1 + 14/5) ≈ 1.34.
--   Tag "Stablecoins" is on 2 (T, X): 1.5 · ln(1 + 14/2) ≈ 3.12.
--   K shares a title word with T; D and Z share T's domain (0.3).
create function pg_temp.related_fixture() returns void
language plpgsql
as $$
declare
  v_name text;
  v_link uuid;
  v_everything uuid;
  v_finance uuid;
  v_stablecoins uuid;
begin
  insert into public.categories (name, slug) values ('Everything', 'everything') returning id into v_everything;
  insert into public.categories (name, slug) values ('Finance', 'finance') returning id into v_finance;
  insert into public.tags (name, slug) values ('Stablecoins', 'stablecoins') returning id into v_stablecoins;

  foreach v_name in array array['T', 'X', 'Y', 'F1', 'F2', 'F3', 'E1', 'E2', 'E3', 'E4', 'W', 'K', 'D', 'Z'] loop
    insert into public.saved_links (url, normalized_url, domain, title)
    values (
      'https://' || lower(v_name) || '.example.com/' || v_name,
      'https://' || lower(v_name) || '.example.com/' || v_name,
      case when v_name in ('T', 'D', 'Z') then 't.example.com' else lower(v_name) || '.example.com' end,
      case v_name
        when 'T' then 'Target piece'
        when 'K' then 'Target practice'
        when 'X' then 'Xylophone'
        when 'Y' then 'Yonder'
        when 'W' then 'Walrus'
        when 'D' then 'Dandelion'
        when 'Z' then 'Zinc'
        else 'Item ' || v_name
      end)
    returning id into v_link;
    if v_name <> 'Z' then
      insert into public.link_categories (link_id, category_id) values (v_link, v_everything);
    end if;
    if v_name in ('T', 'Y', 'F1', 'F2', 'F3') then
      insert into public.link_categories (link_id, category_id) values (v_link, v_finance);
    end if;
    if v_name in ('T', 'X') then
      insert into public.link_tags (link_id, tag_id) values (v_link, v_stablecoins);
    end if;
  end loop;
end;
$$;

do $$
begin
  -- B has a near-copy of T: same domain, title, tag and category names.
  perform tests.login('bbbbbbbb-6000-4000-8000-000000000002');
  perform pg_temp.related_fixture();
  perform tests.login('aaaaaaaa-6000-4000-8000-000000000001');
  perform pg_temp.related_fixture();
  perform tests.logout();
end;
$$;

do $$
declare
  v_target uuid;
  v_ids uuid[];
  v_row record;
  v_x record;
  v_y record;
  v_by_url constant text := $q$(select id from public.saved_links where normalized_url = 'https://%s.example.com/%s')$q$;
begin
  perform tests.login('aaaaaaaa-6000-4000-8000-000000000001');
  select id into v_target from public.saved_links where title = 'Target piece';

  v_ids := tests.ids(format('public.related_links(%L, 20)', v_target));
  perform tests.eq(
    (select array_agg(l.title order by l.title) from public.saved_links l where l.id = any(v_ids)),
    array['Dandelion', 'Item F1', 'Item F2', 'Item F3', 'Target practice', 'Xylophone', 'Yonder'],
    'related: rare tag, shared category, title word and same domain (+ weak category) clear the bar');
  perform tests.ok(not v_target = any(v_ids), 'never the link itself');
  perform tests.eq((select title from public.saved_links where id = v_ids[1]), 'Xylophone',
    'a shared rare tag outranks a shared category');
  perform tests.ok(not exists (select 1 from public.saved_links l where l.id = any(v_ids) and l.user_id <> auth.uid()),
    'only the caller''s links');

  select * into v_x from public.related_links(v_target, 20) r where r.title = 'Xylophone';
  select * into v_y from public.related_links(v_target, 20) r where r.title = 'Yonder';
  perform tests.ok(abs(v_x.score - (1.5 * ln(1 + 14 / 2.0) + ln(1 + 14 / 13.0))) < 0.001,
    format('X score is rare tag + common category (%s)', v_x.score));
  perform tests.ok(abs(v_y.score - (ln(1 + 14 / 5.0) + ln(1 + 14 / 13.0))) < 0.001,
    format('Y score is two categories (%s)', v_y.score));
  perform tests.eq(v_x.shared_tags, array['Stablecoins'], 'shared tags named');
  perform tests.eq(v_x.shared_categories, array['Everything'], 'shared categories named (X)');
  perform tests.eq(v_y.shared_categories, array['Everything', 'Finance'], 'shared categories named (Y)');
  perform tests.eq(v_y.shared_tags, '{}'::text[], 'no shared tags is an empty array');
  perform tests.eq(v_y.domain, 'y.example.com', 'row carries the link fields');
  perform tests.eq(v_y.status, 'unread'::public.reading_status, 'row carries the status');

  select * into v_row from public.related_links(v_target, 20) r where r.title = 'Dandelion';
  perform tests.ok(abs(v_row.score - (0.3 + ln(1 + 14 / 13.0))) < 0.001, format('same domain adds 0.3 (%s)', v_row.score));
  select * into v_row from public.related_links(v_target, 20) r where r.title = 'Target practice';
  perform tests.ok(v_row.score > ln(1 + 14 / 13.0) + 0.1, format('a shared title word adds weight (%s)', v_row.score));

  -- Limits.
  perform tests.eq(cardinality(tests.ids(format('public.related_links(%L)', v_target))), 6, 'default limit 6');
  perform tests.eq(tests.ids(format('public.related_links(%L, 1)', v_target)), v_ids[1:1], 'limit 1 is the best match');
  perform tests.eq(cardinality(tests.ids(format('public.related_links(%L, 0)', v_target))), 1, 'limit below 1 is 1');
  perform tests.eq(cardinality(tests.ids(format('public.related_links(%L, null)', v_target))), 6, 'null limit is 6');

  -- Links with nothing in common, and unknown ids.
  perform tests.eq(cardinality(tests.ids(format('public.related_links(%s)', format(v_by_url, 'z', 'Z')))), 0,
    'a link sharing only its domain gets nothing');
  perform tests.eq(cardinality(tests.ids(format('public.related_links(%L)', gen_random_uuid()))), 0, 'unknown link');
  perform tests.eq(cardinality(tests.ids('public.related_links(null)')), 0, 'null link');

  -- An untitled link (no keywords) and a link whose title is all stop words still work.
  update public.saved_links set title = null where id = v_target;
  perform tests.eq(cardinality(tests.ids(format('public.related_links(%L, 20)', v_target))), 6, 'untitled target: K drops out');
  update public.saved_links set title = 'About these their which' where id = v_target;
  perform tests.eq(cardinality(tests.ids(format('public.related_links(%L, 20)', v_target))), 6, 'stop-word title');

  perform tests.logout();
end;
$$;

-- More than 20 candidates: the limit is clamped to 20.
do $$
declare
  v_tag uuid;
  v_first uuid;
begin
  perform tests.login('cccccccc-6000-4000-8000-000000000003');
  insert into public.tags (name, slug) values ('Shared', 'shared') returning id into v_tag;
  insert into public.saved_links (url, normalized_url, domain)
  select 'https://c.example.com/' || n, 'https://c.example.com/' || n, 'c' || n || '.example.com' from generate_series(1, 26) n;
  insert into public.link_tags (link_id, tag_id) select id, v_tag from public.saved_links;
  select id into v_first from public.saved_links limit 1;
  perform tests.eq(cardinality(tests.ids(format('public.related_links(%L, 1000)', v_first))), 20, 'limit clamped to 20');
  perform tests.logout();
end;
$$;

-- ─── rediscover ─────────────────────────────────────────────────────────────
do $$
declare
  v_rows jsonb;
  v_again jsonb;
  v_row record;
  v_forgotten uuid[] := '{}';
  v_random uuid[] := '{}';
  v_seed int;
begin
  perform tests.login('dddddddd-6000-4000-8000-000000000004');
  perform tests.eq((select count(*) from public.rediscover('any')), 0::bigint, 'empty library: no picks');

  -- 5 long-forgotten unread links, 1 unread from 10 days ago, 3 favorites (one of them
  -- also long-forgotten), 20 recent ones.
  insert into public.saved_links (url, normalized_url, domain, title, status, is_favorite, created_at)
  select 'https://d.example.com/' || n, 'https://d.example.com/' || n, 'd.example.com', 'Link ' || n,
    case when n between 1 and 6 then 'unread' when n % 3 = 0 then 'finished' else 'reading' end::public.reading_status,
    n in (1, 7, 8),
    case
      when n between 1 and 5 then now() - (35 + n) * interval '1 day'
      when n = 6 then now() - interval '10 days'
      when n in (7, 8) then now() - interval '5 days'
      else now() - n * interval '1 minute'
    end
  from generate_series(1, 29) n;

  select jsonb_agg(to_jsonb(r)) into v_rows from public.rediscover('seed-1') r;
  select jsonb_agg(to_jsonb(r)) into v_again from public.rediscover('seed-1') r;
  perform tests.eq(v_rows, v_again, 'same seed, same picks');
  perform tests.eq((select array_agg(r.kind) from public.rediscover('seed-1') r), array['forgotten', 'favorite', 'random'],
    'three picks in a fixed order');
  perform tests.eq((select count(distinct r.id) from public.rediscover('seed-1') r), 3::bigint, 'three different links');

  for v_seed in 1..25 loop
    for v_row in select r.*, l.status as real_status, l.created_at as real_created, l.is_favorite as real_favorite, l.title as real_title
                 from public.rediscover('seed-' || v_seed) r join public.saved_links l on l.id = r.id loop
      perform tests.eq(v_row.title, v_row.real_title, 'row carries the link''s fields');
      if v_row.kind = 'forgotten' then
        perform tests.ok(v_row.status = 'unread' and v_row.created_at < now() - interval '30 days',
          format('forgotten pick is unread and over 30 days old (seed %s)', v_seed));
        v_forgotten := v_forgotten || v_row.id;
      elsif v_row.kind = 'favorite' then
        perform tests.ok(v_row.is_favorite, format('favorite pick is a favorite (seed %s)', v_seed));
      else
        perform tests.eq(v_row.kind, 'random', 'only three kinds');
        v_random := v_random || v_row.id;
      end if;
    end loop;
    perform tests.eq((select count(distinct r.id) from public.rediscover('seed-' || v_seed) r), 3::bigint,
      format('distinct picks (seed %s)', v_seed));
  end loop;
  perform tests.ok((select count(distinct f) from unnest(v_forgotten) f) >= 3, 'different seeds pick different forgotten links');
  perform tests.ok((select count(distinct f) from unnest(v_random) f) >= 5, 'different seeds pick different random links');
  perform tests.eq((select count(*) from public.rediscover(null)), 3::bigint, 'null seed works');
  perform tests.eq((select array_agg(id) from public.rediscover(null)), (select array_agg(id) from public.rediscover('')),
    'null seed is the empty seed');

  perform tests.logout();
end;
$$;

-- Small libraries: fallbacks and missing picks.
do $$
declare
  v_fresh uuid;
  v_week uuid;
begin
  perform tests.login('eeeeeeee-6000-4000-8000-000000000005');

  insert into public.saved_links (url, normalized_url, domain, created_at)
  values ('https://e.example.com/fresh', 'https://e.example.com/fresh', 'e.example.com', now()) returning id into v_fresh;
  perform tests.eq((select array_agg(kind || ':' || (id = v_fresh)) from public.rediscover('s')), array['random:true'],
    'one fresh link: only a random pick');

  insert into public.saved_links (url, normalized_url, domain, created_at)
  values ('https://e.example.com/week', 'https://e.example.com/week', 'e.example.com', now() - interval '7 days') returning id into v_week;
  perform tests.eq((select array_agg(kind || ':' || id order by kind) from public.rediscover('s')),
    array['forgotten:' || v_week, 'random:' || v_fresh], 'nothing over 30 days: the oldest unread past 3 days is forgotten');

  update public.saved_links set status = 'finished' where id = v_week;
  perform tests.eq((select count(*) from public.rediscover('s') where kind = 'forgotten'), 0::bigint, 'finished links are not forgotten');

  delete from public.saved_links where id = v_fresh;
  update public.saved_links set status = 'unread', is_favorite = true, created_at = now() - interval '90 days' where id = v_week;
  perform tests.eq((select array_agg(kind) from public.rediscover('s')), array['forgotten'],
    'one old unread favorite: picked once, as forgotten');

  perform tests.logout();
end;
$$;

rollback;
