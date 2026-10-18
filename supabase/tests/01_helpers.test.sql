-- Helpers shared by the SQL tests: assertions, identity switching and
-- expected-error checks. They live in their own `tests` schema (committed, so
-- every later file can use them) and never touch the application's objects.
--
-- Identity: tests.login(uuid) acts as a signed-in user exactly as PostgREST
-- does (role `authenticated` plus the JWT `sub` claim), tests.login_anon() as a
-- visitor, tests.logout() returns to the connecting role. All three are
-- transaction-local, so call them inside the file's begin … rollback, and not
-- inside an exception block (an error there would undo the switch).

create schema if not exists tests;
grant usage on schema tests to public;

-- Raises unless the condition is exactly true (null fails too).
create or replace function tests.ok(p_condition boolean, p_message text) returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'FAILED: %', p_message;
  end if;
end;
$$;

-- Raises unless actual equals expected (null-safe).
create or replace function tests.eq(p_actual anycompatible, p_expected anycompatible, p_message text) returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAILED: % (expected %, got %)', p_message, coalesce(p_expected::text, 'null'), coalesce(p_actual::text, 'null');
  end if;
end;
$$;

-- Runs a statement that must fail with the given SQLSTATE (any error when
-- null) and, optionally, a message matching the LIKE pattern.
create or replace function tests.throws(
  p_sql text,
  p_sqlstate text,
  p_message text,
  p_error_like text default null
) returns void
language plpgsql
as $$
declare
  v_state text;
  v_error text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_error = message_text;
  end;
  if v_state is null then
    raise exception 'FAILED: % (expected error %, but it succeeded: %)', p_message, coalesce(p_sqlstate, 'any'), p_sql;
  end if;
  if p_sqlstate is not null and v_state <> p_sqlstate then
    raise exception 'FAILED: % (expected error %, got %: %)', p_message, p_sqlstate, v_state, v_error;
  end if;
  if p_error_like is not null and v_error not like p_error_like then
    raise exception 'FAILED: % (error message "%" does not match "%")', p_message, v_error, p_error_like;
  end if;
end;
$$;

-- Runs a statement and returns how many rows it affected (or returned).
create or replace function tests.affected(p_sql text) returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Runs a query and returns its single value as text (for compact checks).
create or replace function tests.value(p_sql text) returns text
language plpgsql
as $$
declare
  v_result text;
begin
  execute p_sql into v_result;
  return v_result;
end;
$$;

create or replace function tests.login(p_user uuid) returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end;
$$;

create or replace function tests.login_anon() returns void
language plpgsql
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create or replace function tests.logout() returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- A signed-in user's link, created through save_link() like the app does
-- (normalized url = lowercased url; domain = the host part).
create or replace function tests.link(p_url text, p_title text default null) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select s.link_id into v_id
  from public.save_link(p_url, lower(p_url), lower(split_part(split_part(p_url, '://', 2), '/', 1)), p_title) s;
  return v_id;
end;
$$;

-- The `id` column of a set-returning function call, in the order returned:
-- tests.ids('public.list_links(p_sort => ''alpha'')').
create or replace function tests.ids(p_call text) returns uuid[]
language plpgsql
as $$
declare
  v_ids uuid[];
begin
  execute format('select coalesce(array_agg(r.id order by r.ordinality), ''{}'') from %s with ordinality as r', p_call)
  into v_ids;
  return v_ids;
end;
$$;

-- A sorted copy of an array, for order-insensitive comparisons. (p_values[0:-1]
-- is an empty array of the same type, for empty input.)
create or replace function tests.sorted(p_values anyarray) returns anyarray
language sql
immutable
as $$
  select coalesce(array_agg(v order by v), p_values[0:-1]) from unnest(p_values) as v;
$$;

-- Sanity checks of the helpers themselves.
do $$
begin
  perform tests.ok(true, 'ok(true)');
  perform tests.eq(1::bigint, 1, 'eq across integer types');
  perform tests.eq(null::text, null, 'eq of nulls');
  perform tests.throws('select 1/0', '22012', 'throws catches the error');
  perform tests.eq(tests.affected('select generate_series(1, 3)'), 3::bigint, 'affected counts rows');
  perform tests.eq(tests.sorted(array[3, 1, 2]), array[1, 2, 3], 'sorted');
  perform tests.eq(tests.sorted('{}'::int[]), '{}'::int[], 'sorted empty');

  begin
    perform tests.ok(false, 'expected');
    raise exception 'tests.ok(false) did not raise';
  exception when raise_exception then
    if sqlerrm not like 'FAILED: expected%' then
      raise;
    end if;
  end;
end;
$$;
