-- The Wire adds one table, one function and one view, and it may share a
-- project with other things. If any of its three names is already taken,
-- stop here, before anything is made or replaced, and say which.
do $$
begin
  if to_regclass('public.events') is not null then
    raise exception 'A table called events already exists in this project. If it is the Wire''s own, the table is already made and there is nothing to run. If it is something else, put the Wire in a different Supabase project.';
  end if;
  if to_regclass('public.day_metrics') is not null or to_regprocedure('public.day_of(timestamptz)') is not null then
    raise exception 'This project already has day_metrics or day_of. The Wire needs those names for its own, so put it in a different Supabase project.';
  end if;
end $$;

-- One table. Everything you will ever measure goes in here.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  metric text not null,
  value numeric,
  unit text,
  source text not null,
  source_id text,
  event_type text not null default 'measurement',
  context jsonb not null default '{}'
);

-- If the same reading arrives twice, it lands once.
create unique index events_once on public.events (user_id, source, source_id, metric)
  where source_id is not null;

-- On. By default nobody can read anything, including you.
alter table public.events enable row level security;

-- Read your own rows. Write your own rows. That is the whole permission system.
create policy read_own on public.events for select using (user_id = auth.uid());
create policy write_own on public.events for insert with check (user_id = auth.uid());

-- No update policy. No delete policy. You cannot rewrite your history.

-- Your day ends at 6am, not midnight.
create or replace function public.day_of(ts timestamptz) returns date
language sql immutable as $$
  select ((ts at time zone 'Europe/Zurich') - interval '6 hours')::date
$$;

-- Not a table. A question, saved.
create or replace view public.day_metrics with (security_invoker = on) as
select
  user_id,
  public.day_of(occurred_at) as day,
  metric,
  count(*) as readings,
  avg(value) as mean,
  (array_agg(value order by occurred_at desc))[1] as last,
  max(occurred_at) as last_at
from public.events
where value is not null and event_type = 'measurement'
group by 1, 2, 3;

create index events_day_window on public.events (user_id, public.day_of(occurred_at), metric)
  where value is not null;
