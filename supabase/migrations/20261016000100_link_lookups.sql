-- Single-link lookups used by the detail page, by polling while a link is
-- being processed, and by actions that return the updated item.

-- One link in exactly the shape of a list_links row.
create function public.get_link_item(p_link_id uuid)
returns table (
  id uuid,
  url text,
  domain text,
  title text,
  description text,
  author text,
  site_name text,
  published_at timestamptz,
  reading_minutes integer,
  status public.reading_status,
  is_favorite boolean,
  created_at timestamptz,
  metadata_status public.processing_status,
  classification_status public.processing_status,
  categories jsonb,
  tags jsonb,
  rank real,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  select
    l.id, l.url, l.domain, l.title, l.description, l.author, l.site_name, l.published_at,
    l.reading_minutes, l.status, l.is_favorite, l.created_at, l.metadata_status,
    l.classification_status,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) order by c.name)
      from public.link_categories lc
      join public.categories c on c.id = lc.category_id
      where lc.link_id = l.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug) order by t.name)
      from public.link_tags lt
      join public.tags t on t.id = lt.tag_id
      where lt.link_id = l.id
    ), '[]'::jsonb),
    0::real,
    1::bigint
  from public.saved_links l
  where l.id = p_link_id
    and l.user_id = (select auth.uid());
$$;

-- Everything the detail page needs in one round trip, or null.
create function public.link_detail(p_link_id uuid) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'link', to_jsonb(l) - 'search_vector' - 'taxonomy_text' - 'notes_text' - 'content_excerpt',
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) order by c.name)
      from public.link_categories lc
      join public.categories c on c.id = lc.category_id
      where lc.link_id = l.id
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug) order by t.name)
      from public.link_tags lt
      join public.tags t on t.id = lt.tag_id
      where lt.link_id = l.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'link_id', n.link_id, 'body', n.body,
        'created_at', n.created_at, 'updated_at', n.updated_at) order by n.created_at desc)
      from public.notes n
      where n.link_id = l.id
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object('id', co.id, 'name', co.name) order by lower(co.name))
      from public.collection_links cl
      join public.collections co on co.id = cl.collection_id
      where cl.link_id = l.id
    ), '[]'::jsonb),
    'suggested_collections', coalesce((
      select jsonb_agg(jsonb_build_object('id', co.id, 'name', co.name) order by lower(co.name))
      from public.collections co
      where co.id = any(l.suggested_collection_ids)
        and co.user_id = l.user_id
        and not exists (
          select 1 from public.collection_links cl
          where cl.collection_id = co.id and cl.link_id = l.id)
    ), '[]'::jsonb)
  )
  from public.saved_links l
  where l.id = p_link_id
    and l.user_id = (select auth.uid());
$$;

revoke execute on function public.get_link_item(uuid), public.link_detail(uuid) from public, anon;
grant execute on function public.get_link_item(uuid), public.link_detail(uuid) to authenticated;
