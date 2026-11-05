-- get_exercise_pr now also says which day each record was set, so the
-- "Current PR" chip can jump back to that day. Same ranking and return type
-- as migration 006; only a 'date' key (YYYY-MM-DD) is added to each object.
create or replace function public.get_exercise_pr(p_exercise_def_id bigint)
returns jsonb
language sql
security invoker
as $$
  select jsonb_build_object(
    'best_weight', (
      select jsonb_build_object('weight', s.weight, 'unit', e.unit, 'reps', s.reps,
                                'date', to_char(e.date, 'YYYY-MM-DD'))
      from public.exercise_sets s
      join public.exercises e on e.id = s.exercise_id
      where e.user_id = auth.uid()
        and e.exercise_def_id = p_exercise_def_id
        and s.weight is not null
      order by public.to_kg(s.weight, e.unit) desc, coalesce(s.reps, 0) desc, s.id
      limit 1
    ),
    'best_e1rm', (
      select jsonb_build_object(
        'weight', s.weight, 'unit', e.unit, 'reps', s.reps,
        'e1rm_kg', round(public.to_kg(s.weight, e.unit) * (1 + s.reps / 30.0), 1),
        'date', to_char(e.date, 'YYYY-MM-DD'))
      from public.exercise_sets s
      join public.exercises e on e.id = s.exercise_id
      where e.user_id = auth.uid()
        and e.exercise_def_id = p_exercise_def_id
        and s.weight is not null and s.reps > 1
      order by public.to_kg(s.weight, e.unit) * (1 + s.reps / 30.0) desc, s.id
      limit 1
    )
  );
$$;
