-- save_link(): inserting, duplicate detection by URL and by canonical URL,
-- and title cleanup.
begin;

insert into auth.users (id, email) values ('aaaaaaaa-2000-4000-8000-000000000001', 'save-a@example.com');

do $$
declare
  v_first record;
  v_again record;
  v_row public.saved_links;
  v_id uuid;
begin
  perform tests.login('aaaaaaaa-2000-4000-8000-000000000001');

  -- A new link.
  select * into v_first from public.save_link('https://Example.com/Article?x=1', 'https://example.com/article?x=1', 'example.com', '  The Article  ');
  perform tests.ok(v_first.link_id is not null, 'save_link returns an id');
  perform tests.eq(v_first.duplicate, false, 'a new link is not a duplicate');
  select * into v_row from public.saved_links where id = v_first.link_id;
  perform tests.eq(v_row.user_id, 'aaaaaaaa-2000-4000-8000-000000000001'::uuid, 'owned by the caller');
  perform tests.eq(v_row.url, 'https://Example.com/Article?x=1', 'url kept as given');
  perform tests.eq(v_row.normalized_url, 'https://example.com/article?x=1', 'normalized url stored');
  perform tests.eq(v_row.domain, 'example.com', 'domain stored');
  perform tests.eq(v_row.title, 'The Article', 'title trimmed');
  perform tests.eq(v_row.status, 'unread'::public.reading_status, 'starts unread');
  perform tests.eq(v_row.metadata_status, 'pending'::public.processing_status, 'metadata pending');
  perform tests.eq(v_row.classification_status, 'pending'::public.processing_status, 'classification pending');
  perform tests.eq(v_row.is_favorite, false, 'not a favorite');
  perform tests.ok(v_row.status_changed_at is null and v_row.finished_at is null and v_row.favorited_at is null,
    'no status timestamps yet');
  perform tests.ok(v_row.search_vector @@ to_tsquery('english', 'articl'), 'search vector built on insert');

  -- Same normalized URL: the existing row, untouched.
  select * into v_again from public.save_link('https://example.com/article?x=1', 'https://example.com/article?x=1', 'example.com', 'Other title');
  perform tests.eq(v_again.link_id, v_first.link_id, 'duplicate by normalized url returns the existing id');
  perform tests.eq(v_again.duplicate, true, 'flagged as duplicate');
  perform tests.eq((select title from public.saved_links where id = v_first.link_id), 'The Article', 'duplicate save keeps the title');
  perform tests.eq((select count(*) from public.saved_links), 1::bigint, 'still one row');

  -- A URL that a saved page declared as its canonical address.
  update public.saved_links
  set canonical_url = 'https://example.com/canonical', canonical_normalized_url = 'https://example.com/canonical'
  where id = v_first.link_id;
  select * into v_again from public.save_link('https://example.com/canonical/', 'https://example.com/canonical', 'example.com');
  perform tests.eq(v_again.link_id, v_first.link_id, 'duplicate by canonical url returns the existing id');
  perform tests.eq(v_again.duplicate, true, 'canonical match flagged as duplicate');
  perform tests.eq((select count(*) from public.saved_links), 1::bigint, 'canonical duplicate adds no row');

  -- When one link has the URL itself and an older one has it as its canonical
  -- address, the exact match wins.
  select link_id into v_id from public.save_link('https://example.com/older', 'https://example.com/older', 'example.com');
  update public.saved_links set canonical_normalized_url = 'https://example.com/exact', created_at = now() - interval '1 day'
  where id = v_id;
  insert into public.saved_links (url, normalized_url, domain)
  values ('https://example.com/exact', 'https://example.com/exact', 'example.com') returning id into v_id;
  select * into v_again from public.save_link('https://example.com/exact', 'https://example.com/exact', 'example.com');
  perform tests.eq(v_again.link_id, v_id, 'exact url match preferred over a canonical match');
  delete from public.saved_links where normalized_url in ('https://example.com/older', 'https://example.com/exact');

  -- Titles: blank and missing become null, overlong ones are cut to the column limit.
  select link_id into v_id from public.save_link('https://example.com/blank', 'https://example.com/blank', 'example.com', '   ');
  perform tests.ok((select title from public.saved_links where id = v_id) is null, 'blank title becomes null');
  select link_id into v_id from public.save_link('https://example.com/empty', 'https://example.com/empty', 'example.com', '');
  perform tests.ok((select title from public.saved_links where id = v_id) is null, 'empty title becomes null');
  select link_id into v_id from public.save_link('https://example.com/none', 'https://example.com/none', 'example.com');
  perform tests.ok((select title from public.saved_links where id = v_id) is null, 'missing title is null');
  select link_id into v_id from public.save_link('https://example.com/tabs', 'https://example.com/tabs', 'example.com', e'\t Tabbed \r\n');
  perform tests.eq((select title from public.saved_links where id = v_id), 'Tabbed', 'tabs and newlines trimmed too');
  select link_id into v_id from public.save_link('https://example.com/ws', 'https://example.com/ws', 'example.com', e'\n\t \n');
  perform tests.ok((select title from public.saved_links where id = v_id) is null, 'whitespace-only title becomes null');
  select link_id into v_id from public.save_link('https://example.com/inner', 'https://example.com/inner', 'example.com', ' Two  words ');
  perform tests.eq((select title from public.saved_links where id = v_id), 'Two  words', 'inner spacing kept');
  select link_id into v_id from public.save_link('https://example.com/long', 'https://example.com/long', 'example.com', repeat('x', 900));
  perform tests.eq((select char_length(title) from public.saved_links where id = v_id), 500, 'overlong title cut to 500');

  -- Saving a different URL on the same domain is a new link.
  select * into v_again from public.save_link('https://example.com/article?x=2', 'https://example.com/article?x=2', 'example.com');
  perform tests.ok(v_again.link_id <> v_first.link_id and not v_again.duplicate, 'different url is a new link');

  -- Required values are still enforced.
  perform tests.throws($q$select public.save_link('https://example.com/x', null, 'example.com')$q$, '23502', 'normalized url required');
  perform tests.throws($q$select public.save_link('', '', 'example.com')$q$, '23514', 'empty url rejected');
  perform tests.throws(format($q$select public.save_link(%L, %L, 'example.com')$q$,
    'https://example.com/' || repeat('a', 4100), 'https://example.com/' || repeat('a', 4100)), '23514', 'url over 4096 rejected');

  perform tests.logout();
end;
$$;

rollback;
