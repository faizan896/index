-- get_link_item() and link_detail(): shape, and that they never cross users.
begin;

insert into auth.users (id, email) values
  ('a0a0a0a0-0000-4000-8000-000000000901', 'lookup-a@example.com'),
  ('b0b0b0b0-0000-4000-8000-000000000902', 'lookup-b@example.com');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0a0a0a0-0000-4000-8000-000000000901', true);

do $$
declare
  v_link uuid;
  v_collection uuid;
  v_item record;
  v_detail jsonb;
begin
  select link_id into v_link from public.save_link('https://example.com/lookup', 'https://example.com/lookup', 'example.com', 'Lookup');
  insert into public.collections (name) values ('Lookups') returning id into v_collection;
  update public.saved_links set suggested_collection_ids = array[v_collection] where id = v_link;
  perform public.apply_classification(v_link, '[{"name":"Finance","slug":"finance"}]', '[{"name":"Ledgers","slug":"ledgers"}]', array[v_collection], 'test');
  insert into public.notes (link_id, body) values (v_link, 'first'), (v_link, 'second');

  select * into v_item from public.get_link_item(v_link);
  if v_item.id is distinct from v_link or v_item.title <> 'Lookup' or v_item.total_count <> 1 then
    raise exception 'get_link_item returned the wrong row: %', row_to_json(v_item);
  end if;
  if jsonb_array_length(v_item.categories) <> 1 or v_item.tags->0->>'slug' <> 'ledgers' then
    raise exception 'get_link_item terms wrong: % %', v_item.categories, v_item.tags;
  end if;

  v_detail := public.link_detail(v_link);
  if v_detail->'link'->>'id' <> v_link::text then
    raise exception 'link_detail missing link: %', v_detail;
  end if;
  if v_detail->'link' ? 'search_vector' or v_detail->'link' ? 'content_excerpt' or v_detail->'link' ? 'notes_text' then
    raise exception 'link_detail leaks internal columns';
  end if;
  if jsonb_array_length(v_detail->'notes') <> 2 then
    raise exception 'link_detail notes wrong: %', v_detail->'notes';
  end if;
  if jsonb_array_length(v_detail->'suggested_collections') <> 1 then
    raise exception 'suggestion should show until the link is in the collection: %', v_detail;
  end if;

  insert into public.collection_links (collection_id, link_id) values (v_collection, v_link);
  v_detail := public.link_detail(v_link);
  if jsonb_array_length(v_detail->'collections') <> 1 or jsonb_array_length(v_detail->'suggested_collections') <> 0 then
    raise exception 'collections/suggestions wrong after adding: %', v_detail;
  end if;

  -- Another user sees nothing.
  perform set_config('request.jwt.claim.sub', 'b0b0b0b0-0000-4000-8000-000000000902', true);
  if public.link_detail(v_link) is not null then
    raise exception 'link_detail leaked another user''s link';
  end if;
  if exists (select 1 from public.get_link_item(v_link)) then
    raise exception 'get_link_item leaked another user''s link';
  end if;
end;
$$;

rollback;
