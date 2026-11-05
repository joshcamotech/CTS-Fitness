-- ================================================================
-- CTS Fitness — Supabase (Postgres) schema
--
-- Run this once, in full, in the Supabase SQL editor for a fresh
-- project. It replaces backend/sql/schema.sql (Azure SQL Server)
-- with a Postgres equivalent, plus user_id + Row Level Security
-- and two RPC functions that restore the transactional guarantees
-- backend/src/routes/workouts.js provided (POST/PUT wrapped
-- exercise+sets writes in a SQL transaction — PostgREST alone
-- can't do that across two tables from the client).
-- ================================================================

-- ── exercises (parent) ─────────────────────────────────────
create table public.exercises (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null check (char_length(btrim(name)) > 0 and char_length(name) <= 255),
  date       date        not null,
  unit       text        not null default 'KG' check (unit in ('KG', 'LBS')),
  notes      text        check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── exercise_sets (child) ──────────────────────────────────
create table public.exercise_sets (
  id          bigint generated always as identity primary key,
  exercise_id bigint      not null references public.exercises(id) on delete cascade,
  set_number  int         not null check (set_number > 0),
  reps        int         check (reps is null or (reps >= 1 and reps <= 1000)),
  weight      numeric(10,2) check (weight is null or weight >= 0),
  created_at  timestamptz not null default now(),
  unique (exercise_id, set_number)
);

-- ── Indexes ─────────────────────────────────────────────────
create index idx_exercises_user_date      on public.exercises (user_id, date);
create index idx_exercise_sets_exercise_id on public.exercise_sets (exercise_id);

-- ── updated_at trigger ─────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_exercises_updated_at
before update on public.exercises
for each row execute function public.set_updated_at();

-- ── Row Level Security ─────────────────────────────────────
alter table public.exercises     enable row level security;
alter table public.exercise_sets enable row level security;

create policy exercises_select_own on public.exercises
  for select using (auth.uid() = user_id);
create policy exercises_insert_own on public.exercises
  for insert with check (auth.uid() = user_id);
create policy exercises_update_own on public.exercises
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy exercises_delete_own on public.exercises
  for delete using (auth.uid() = user_id);

create policy exercise_sets_select_own on public.exercise_sets
  for select using (
    exists (select 1 from public.exercises e
            where e.id = exercise_sets.exercise_id and e.user_id = auth.uid())
  );
create policy exercise_sets_insert_own on public.exercise_sets
  for insert with check (
    exists (select 1 from public.exercises e
            where e.id = exercise_sets.exercise_id and e.user_id = auth.uid())
  );
create policy exercise_sets_update_own on public.exercise_sets
  for update using (
    exists (select 1 from public.exercises e
            where e.id = exercise_sets.exercise_id and e.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.exercises e
            where e.id = exercise_sets.exercise_id and e.user_id = auth.uid())
  );
create policy exercise_sets_delete_own on public.exercise_sets
  for delete using (
    exists (select 1 from public.exercises e
            where e.id = exercise_sets.exercise_id and e.user_id = auth.uid())
  );

-- ── RPC: create exercise + sets atomically ─────────────────
-- (replaces the Express POST /api/workouts transaction)
create or replace function public.create_exercise_with_sets(
  p_name  text,
  p_date  date,
  p_unit  text,
  p_notes text,
  p_sets  jsonb   -- [{ "reps": 8, "weight": 60 }, ...]
) returns bigint
language plpgsql
security invoker
as $$
declare
  v_exercise_id bigint;
  v_set jsonb;
  v_idx  int := 0;
begin
  if p_sets is null or jsonb_array_length(p_sets) < 1 or jsonb_array_length(p_sets) > 100 then
    raise exception 'sets must contain between 1 and 100 entries';
  end if;

  insert into public.exercises (user_id, name, date, unit, notes)
  values (auth.uid(), p_name, p_date, p_unit, nullif(p_notes, ''))
  returning id into v_exercise_id;

  for v_set in select * from jsonb_array_elements(p_sets) loop
    v_idx := v_idx + 1;
    insert into public.exercise_sets (exercise_id, set_number, reps, weight)
    values (
      v_exercise_id,
      v_idx,
      (v_set->>'reps')::int,
      (v_set->>'weight')::numeric
    );
  end loop;

  return v_exercise_id;
end;
$$;

grant execute on function public.create_exercise_with_sets(text, date, text, text, jsonb) to authenticated;

-- ── RPC: update exercise fields (partial update via COALESCE) and,
--    if p_sets is provided, replace all sets ──────────────
-- (replaces the Express PUT /api/workouts/:id transaction)
create or replace function public.update_exercise_with_sets(
  p_id    bigint,
  p_name  text default null,
  p_unit  text default null,
  p_notes text default null,
  p_sets  jsonb default null
) returns void
language plpgsql
security invoker
as $$
declare
  v_set jsonb;
  v_idx int := 0;
begin
  if p_sets is not null and (jsonb_array_length(p_sets) < 1 or jsonb_array_length(p_sets) > 100) then
    raise exception 'sets must contain between 1 and 100 entries';
  end if;

  update public.exercises
  set name  = coalesce(p_name,  name),
      unit  = coalesce(p_unit,  unit),
      -- p_notes = null means "not provided, leave unchanged"; p_notes = ''
      -- means "explicitly cleared" and is stored as null (see api.ts, which
      -- always sends '' instead of null to represent an empty notes field).
      notes = case when p_notes is null then notes else nullif(p_notes, '') end
  where id = p_id;

  if not found then
    raise exception 'Exercise % not found or not owned by caller', p_id
      using errcode = 'P0002';
  end if;

  if p_sets is not null then
    delete from public.exercise_sets where exercise_id = p_id;

    for v_set in select * from jsonb_array_elements(p_sets) loop
      v_idx := v_idx + 1;
      insert into public.exercise_sets (exercise_id, set_number, reps, weight)
      values (p_id, v_idx, (v_set->>'reps')::int, (v_set->>'weight')::numeric);
    end loop;
  end if;
end;
$$;

grant execute on function public.update_exercise_with_sets(bigint, text, text, text, jsonb) to authenticated;
