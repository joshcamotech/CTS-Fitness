-- ================================================================
-- Demo account seed — App Store Review (Guideline 2.1)
--
-- The app is login-gated, so review fails without working
-- credentials, and it fails just as surely with credentials that
-- open onto an empty app: a reviewer who cannot see a feed, a
-- friend or a workout history cannot verify the social and
-- moderation features, and 1.2 rejections follow. This fills a
-- demo account with enough real-looking history to exercise every
-- screen.
--
-- ── Before running this ─────────────────────────────────────────
-- Create BOTH accounts through the app's own sign-up screen, so
-- Supabase Auth writes auth.users and auth.identities the way it
-- normally does. Do not hand-insert auth rows.
--
--   1. demo@camotechsolutions.com.au   -> username demo_lifter
--   2. demo2@camotechsolutions.com.au  -> username demo_friend
--
-- Use a password you are willing to put in App Store Connect's
-- review notes in plain text. Then set the two emails below and
-- run this whole file in the Supabase SQL editor.
--
-- The second account exists only so the reviewer has a friend
-- whose posts they can report and block. Give it to the reviewer
-- too — 1.2 expects them to be able to act on someone else's
-- content, not just their own.
--
-- ── Idempotent ──────────────────────────────────────────────────
-- Re-running wipes and rebuilds these two users' workout,
-- social and friendship rows, and any block between the two, scoped
-- strictly by their user ids. content_reports is deliberately NOT
-- cleared: reports are moderation records, so clear test ones by hand.
-- Nothing outside the two demo accounts is touched. Run it again
-- after review feedback, or to freshen the dates before a
-- resubmission, without cleaning anything up first.
--
-- Single DO block: the SQL editor pools connections and does not
-- guarantee two statements share a session, so everything that
-- depends on a local variable has to live in one statement.
-- ================================================================

do $$
declare
  -- ── Set these to the two accounts you created above ───────────
  c_email_main   constant text := 'demo@camotechsolutions.com.au';
  c_email_friend constant text := 'demo2@camotechsolutions.com.au';

  v_main   uuid;
  v_friend uuid;

  -- A 6-week block, four sessions a week. Enough for the dashboard
  -- trend, the 1RM chart, the volume chart and the muscle-group
  -- breakdown to all have something to draw.
  c_weeks  constant int := 6;

  v_week      int;
  v_ex_id     bigint;
  v_def_id    bigint;
  v_date      date;
  v_weight    numeric(10,2);
  v_set       int;
  v_reps      int;
  v_post_main bigint;
  v_post_fr   bigint;
  v_day       record;
  v_lift      text;
  v_rows      int;
begin
  -- ── Resolve the two accounts ──────────────────────────────────
  select id into v_main   from auth.users where lower(email) = lower(c_email_main);
  select id into v_friend from auth.users where lower(email) = lower(c_email_friend);

  if v_main is null then
    raise exception 'No auth user for %. Sign this account up through the app first.', c_email_main;
  end if;
  if v_friend is null then
    raise exception 'No auth user for %. Sign this account up through the app first.', c_email_friend;
  end if;
  if v_main = v_friend then
    raise exception 'The two demo emails resolve to the same user.';
  end if;

  -- ── Wipe anything a previous run left ─────────────────────────
  -- Scoped to the two demo users only. posts cascade to likes and
  -- comments; exercises cascade to exercise_sets.
  delete from public.post_comments   where user_id in (v_main, v_friend);
  delete from public.post_likes      where user_id in (v_main, v_friend);
  delete from public.posts           where user_id in (v_main, v_friend);
  delete from public.exercises       where user_id in (v_main, v_friend);
  delete from public.friendships
   where (requester_id = v_main   and addressee_id = v_friend)
      or (requester_id = v_friend and addressee_id = v_main);
  -- A block left over from testing Report/Block would hide the pair from
  -- each other even with the friendship restored below (is_blocked()
  -- is folded into are_friends(), migration 023).
  delete from public.user_blocks
   where (blocker_id = v_main   and blocked_id = v_friend)
      or (blocker_id = v_friend and blocked_id = v_main);

  -- ── Profiles ──────────────────────────────────────────────────
  -- handle_new_user() already created the rows at sign-up; this
  -- only names them. Usernames are lowercase a-z0-9_, 3-20 chars,
  -- and must survive the content filter from migration 023.
  update public.profiles
     set username = 'demo_lifter', display_name = 'Demo Lifter'
   where id = v_main;
  update public.profiles
     set username = 'demo_friend', display_name = 'Demo Friend'
   where id = v_friend;

  -- ── Training history ──────────────────────────────────────────
  -- Four sessions a week on a push / pull / legs / upper split,
  -- walking backwards from today. Weight climbs 2.5 kg a week per
  -- lift so the 1RM trend line has a visible slope and the PR
  -- detection in migration 002 has real records to find.
  for v_week in reverse c_weeks - 1 .. 0 loop
    for v_day in
      select * from (values
        -- day offset within the week, lift, top-set kg at week 0, top reps
        (0, 'Bench Press',         60.0,  8),
        (0, 'Incline Bench Press', 40.0, 10),
        (0, 'Lateral Raise',       10.0, 15),
        (0, 'Tricep Pushdown',     25.0, 12),
        (2, 'Deadlift',           100.0,  5),
        (2, 'Barbell Row',         60.0,  8),
        (2, 'Lat Pulldown',        50.0, 10),
        (2, 'Barbell Curl',        30.0, 10),
        (4, 'Squat',               80.0,  6),
        (4, 'Romanian Deadlift',   70.0,  8),
        (4, 'Leg Press',          140.0, 10),
        (4, 'Leg Curl',            40.0, 12),
        (5, 'Overhead Press',      40.0,  8),
        (5, 'Dumbbell Row',        30.0, 10),
        (5, 'Pull-Ups',             0.0,  8),
        (5, 'Plank',                0.0,  1)
      ) as t(day_offset, lift, base_kg, top_reps)
    loop
      v_date := current_date - ((c_weeks - 1 - v_week) * 7 + (6 - v_day.day_offset));
      v_lift := v_day.lift;

      -- Global catalog row (user_id is null). If a name ever changes
      -- in the catalog, fail loudly rather than seed a history that
      -- is not linked to anything.
      select id into v_def_id
        from public.exercise_defs
       where user_id is null and lower(name) = lower(v_lift);
      if v_def_id is null then
        raise exception 'Catalog exercise % not found. Update this script to match exercise_defs.', v_lift;
      end if;

      v_weight := v_day.base_kg + (v_week * 2.5);

      insert into public.exercises (user_id, name, date, unit, exercise_def_id)
      values (v_main, v_lift, v_date, 'KG', v_def_id)
      returning id into v_ex_id;

      -- Three sets: two back-off sets then the top set, so the PR
      -- tie-break (heaviest, then most reps) has something to pick.
      -- Back-off is a percentage, not a flat 5 kg: a flat step puts
      -- the light accessory lifts (Lateral Raise opens at 10 kg) on
      -- a 0 kg first set, which is legal but looks like a bug.
      -- Bodyweight lifts carry reps with a null weight, which is
      -- what the app itself writes for them.
      for v_set in 1 .. 3 loop
        v_reps := v_day.top_reps + (3 - v_set);
        insert into public.exercise_sets (exercise_id, set_number, reps, weight)
        values (
          v_ex_id,
          v_set,
          v_reps,
          case when v_day.base_kg = 0 then null
               else round(v_weight * (0.85 + 0.05 * v_set), 2) end
        );
      end loop;
    end loop;
  end loop;

  -- ── A few sessions for the friend ─────────────────────────────
  -- Just enough that their profile is not empty if the reviewer
  -- looks, and that they have something of their own to post.
  select id into v_def_id
    from public.exercise_defs
   where user_id is null and lower(name) = lower('Bench Press');

  -- v_week 0 is the most recent session, so weight must fall as v_week
  -- rises: the newest session is the heaviest (top set 80 kg x 4, which
  -- is what the friend's post below shows).
  for v_week in 0 .. 2 loop
    insert into public.exercises (user_id, name, date, unit, exercise_def_id)
    values (v_friend, 'Bench Press', current_date - (v_week * 7 + 2), 'KG', v_def_id)
    returning id into v_ex_id;

    insert into public.exercise_sets (exercise_id, set_number, reps, weight)
    values (v_ex_id, 1, 8, 65 + ((2 - v_week) * 2.5)),
           (v_ex_id, 2, 6, 70 + ((2 - v_week) * 2.5)),
           (v_ex_id, 3, 4, 75 + ((2 - v_week) * 2.5));
  end loop;

  -- ── Friendship, already accepted ──────────────────────────────
  -- Inserted directly rather than through send_friend_request() and
  -- accept, because those are security invoker and there is no
  -- auth.uid() in a SQL editor session.
  insert into public.friendships (requester_id, addressee_id, status, responded_at)
  values (v_friend, v_main, 'accepted', now() - interval '20 days');

  -- ── Feed ──────────────────────────────────────────────────────
  -- Posts from both sides, so the reviewer has their own post
  -- (delete) and someone else's (report / block) in one feed.
  -- Captions are deliberately bland: they pass the content filter,
  -- and a demo feed is not the place to be clever.
  -- e1rm_kg uses the same Epley formula as share_post() (migration 013):
  -- weight * (1 + reps / 30), 1 dp, so seeded cards match what the app
  -- would compute for a real share of the same set.
  insert into public.posts (user_id, exercise_name, weight, reps, unit, e1rm_kg, caption, created_at)
  values
    (v_main, 'Bench Press',  72.50, 8, 'KG', round(72.50 * (1 + 8 / 30.0), 1), 'Finally moved past the plateau on bench.', now() - interval '6 days'),
    (v_main, 'Squat',        92.50, 6, 'KG', round(92.50 * (1 + 6 / 30.0), 1), 'Felt heavy but the depth was there.',      now() - interval '3 days');

  insert into public.posts (user_id, exercise_name, weight, reps, unit, e1rm_kg, caption, created_at)
  values
    (v_main, 'Deadlift', 112.50, 5, 'KG', round(112.50 * (1 + 5 / 30.0), 1), 'New best. Slow off the floor.', now() - interval '1 day')
  returning id into v_post_main;

  insert into public.posts (user_id, exercise_name, weight, reps, unit, e1rm_kg, caption, created_at)
  values
    (v_friend, 'Bench Press', 80.00, 4, 'KG', round(80.00 * (1 + 4 / 30.0), 1), 'Chasing you on this one.', now() - interval '2 days')
  returning id into v_post_fr;

  -- Conversation across the friendship, both directions, so the
  -- comment overflow menu has a comment from each user in it.
  insert into public.post_comments (post_id, user_id, body, created_at)
  values
    (v_post_main, v_friend, 'Strong lift. What was the rest between sets?', now() - interval '20 hours'),
    (v_post_main, v_main,   'About three minutes on the top set.',          now() - interval '18 hours'),
    (v_post_fr,   v_main,   'Nice, that is a big jump from last month.',    now() - interval '1 day');

  insert into public.post_likes (post_id, user_id, created_at)
  values
    (v_post_main, v_friend, now() - interval '22 hours'),
    (v_post_fr,   v_main,   now() - interval '1 day');

  -- ── Report ────────────────────────────────────────────────────
  select count(*) into v_rows from public.exercises where user_id = v_main;

  raise notice '──────────────────────────────────────────────';
  raise notice 'Demo seed complete.';
  raise notice '  demo_lifter %  (% exercises)', v_main, v_rows;
  raise notice '  demo_friend %', v_friend;
  raise notice '  posts %, comments %, friendship accepted',
    (select count(*) from public.posts         where user_id in (v_main, v_friend)),
    (select count(*) from public.post_comments where user_id in (v_main, v_friend));
  raise notice '──────────────────────────────────────────────';
end
$$;
