-- The app is called CTS Fitness. Migration 023 shipped the content-filter
-- error message with the old working name, and that text is shown to users
-- as-is. Same function body as 023; only the app name in the message changes.
create or replace function public.enforce_content_filter()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_col text;
  v_val text;
begin
  foreach v_col in array tg_argv loop
    v_val := to_jsonb(new) ->> v_col;
    if v_val is not null and public.is_objectionable(v_val) then
      raise exception 'That % contains language that isn''t allowed on CTS Fitness.',
        replace(v_col, '_', ' ')
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;
