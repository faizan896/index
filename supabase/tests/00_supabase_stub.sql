-- Minimal stand-in for the parts of Supabase the schema depends on, so the
-- migrations and tests run against any plain PostgreSQL (CI, local, or the
-- test script). Does nothing when a real Supabase `auth` schema already
-- exists (e.g. DATABASE_URL pointing at `supabase start`).
--
-- Besides the roles and auth.uid(), it reproduces Supabase's default
-- privileges: every table and function created in `public` is granted to
-- anon, authenticated and service_role unless a migration revokes it. The
-- access tests therefore prove the migrations' own revokes, not the
-- emptiness of a bare database.
do $stub$
begin
  if to_regclass('auth.users') is not null then
    raise notice 'auth.users exists; using the real Supabase auth schema';
    return;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  create table auth.users (
    id uuid primary key,
    email text
  );

  -- Same behaviour as Supabase's auth.uid(): the `sub` claim of the request JWT.
  create function auth.uid() returns uuid
  language sql
  stable
  as $fn$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid;
  $fn$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
end;
$stub$;
