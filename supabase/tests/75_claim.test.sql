-- claim_link_processing(): claims once, refuses a fresh claim (even forced),
-- takes over a claim older than five minutes, and decides per stage what
-- needs doing, with and without force.
begin;

insert into auth.users (id, email) values ('aaaaaaaa-7500-4000-8000-000000000001', 'claim-a@example.com');

create function pg_temp.set_state(p_link uuid, p_metadata text, p_classification text, p_started interval) returns void
language sql
as $$
  update public.saved_links
  set metadata_status = p_metadata::public.processing_status,
      classification_status = p_classification::public.processing_status,
      processing_started_at = now() - p_started
  where id = p_link;
$$;

-- What a claim returned: '' when nothing, else "metadata/classification".
create function pg_temp.claim(p_link uuid, p_force boolean default false) returns text
language sql
as $$
  select coalesce((select c.metadata_status || '/' || c.classification_status from public.claim_link_processing(p_link, p_force) c), '');
$$;

do $$
declare
  v_link uuid;
  v_row public.saved_links;
  v_case record;
begin
  perform tests.login('aaaaaaaa-7500-4000-8000-000000000001');
  v_link := tests.link('https://example.com/claim', 'Claim me');

  -- A new link: both stages to do.
  select * into v_row from public.claim_link_processing(v_link);
  perform tests.eq(v_row.id, v_link, 'claimed');
  perform tests.eq(v_row.metadata_status || '/' || v_row.classification_status, 'processing/processing', 'both stages claimed');
  perform tests.eq(v_row.processing_started_at, now(), 'claim time recorded');
  perform tests.eq(v_row.url, 'https://example.com/claim', 'the whole row comes back');
  perform tests.eq((select metadata_status from public.saved_links where id = v_link), 'processing'::public.processing_status,
    'claim is stored');

  -- A fresh claim can't be taken again, forced or not.
  perform tests.eq(pg_temp.claim(v_link), '', 'second immediate claim gets nothing');
  perform tests.eq(pg_temp.claim(v_link, true), '', 'force does not override a live claim');
  perform pg_temp.set_state(v_link, 'processing', 'processing', interval '4 minutes 50 seconds');
  perform tests.eq(pg_temp.claim(v_link), '', 'a claim under five minutes old is live');

  -- An abandoned claim (over five minutes) is taken over.
  perform pg_temp.set_state(v_link, 'processing', 'processing', interval '5 minutes 1 second');
  perform tests.eq(pg_temp.claim(v_link), 'processing/processing', 'stale claim reclaimed');
  perform tests.eq((select processing_started_at from public.saved_links where id = v_link), now(), 'claim time renewed');
  perform tests.eq(pg_temp.claim(v_link), '', 'and is live again');

  -- Per-stage decisions, from a released claim (processing_started_at null) unless noted.
  for v_case in
    select * from (values
      -- metadata, classification, claim age, force, expected result
      ('done', 'done', null, false, '', 'all done: nothing to claim'),
      ('done', 'done', null, true, 'processing/done', 'force re-reads the page, keeps categories'),
      ('done', 'skipped', null, false, '', 'skipped stays skipped without force'),
      ('done', 'skipped', null, true, 'processing/processing', 'force retries a skipped classification'),
      ('failed', 'done', null, false, 'processing/done', 'failed fetch retried'),
      ('done', 'failed', null, false, 'done/processing', 'failed classification retried'),
      ('done', 'pending', null, false, 'done/processing', 'pending classification'),
      ('pending', 'done', null, false, 'processing/done', 'pending fetch'),
      ('failed', 'failed', null, false, 'processing/processing', 'both failed'),
      ('skipped', 'done', null, true, 'processing/done', 'force re-reads a skipped fetch'),
      ('done', 'done', interval '10 minutes', false, '', 'stale timestamp but nothing to do'),
      ('done', 'processing', interval '10 minutes', false, 'done/processing', 'stale classification only'),
      ('processing', 'done', interval '10 minutes', true, 'processing/done', 'stale fetch, forced'),
      ('processing', 'pending', null, false, 'processing/processing', 'lost claim (no timestamp) is recoverable'),
      ('done', 'failed', interval '1 minute', true, '', 'a live claim wins over force'),
      ('done', 'done', null, null, '', 'null force is no force')
    ) as cases(metadata, classification, age, force, expected, label)
  loop
    update public.saved_links
    set metadata_status = v_case.metadata::public.processing_status,
        classification_status = v_case.classification::public.processing_status,
        processing_started_at = now() - v_case.age
    where id = v_link;
    perform tests.eq(pg_temp.claim(v_link, v_case.force), v_case.expected, v_case.label);
    if v_case.expected <> '' then
      perform tests.eq((select processing_started_at from public.saved_links where id = v_link), now(), v_case.label || ': claim stamped');
    end if;
  end loop;

  perform tests.eq(pg_temp.claim(gen_random_uuid()), '', 'unknown link');
  perform tests.eq(pg_temp.claim(null), '', 'null link');

  perform tests.logout();
end;
$$;

rollback;
