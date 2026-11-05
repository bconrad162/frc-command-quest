-- Command Quest: classroom competitions, participants, attempts, and scores.
--
-- Security model
--  * Students sign in with Supabase anonymous auth (no email). They can only
--    read their own classroom's leaderboard and their own attempts.
--  * Score-changing writes happen ONLY in the `submit-answer` Edge Function
--    (service role, server-side grading) and in SECURITY DEFINER functions below
--    that check auth.uid(). Clients have no INSERT/UPDATE/DELETE grants on tables.
--  * Teachers are regular (non-anonymous) Supabase users listed in `teachers`.
--    A project admin adds them (see README).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables

create table public.teachers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  join_code text not null unique check (join_code ~ '^[A-Z2-9]{6}$'),
  status text not null default 'lobby' check (status in ('lobby', 'running', 'closed')),
  enabled_difficulties text[] not null default array['easy', 'medium', 'hard']
    check (enabled_difficulties <@ array['easy', 'medium', 'hard'] and cardinality(enabled_difficulties) > 0),
  duration_minutes integer not null default 40 check (duration_minutes between 5 and 240),
  rankings_hidden boolean not null default false,
  started_at timestamptz,
  ends_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index classrooms_owner_idx on public.classrooms (owner_id);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null check (nickname ~ '^[A-Za-z0-9 _.!''-]{2,24}$'),
  total_points integer not null default 0,
  easy_completed integer not null default 0,
  medium_completed integer not null default 0,
  hard_completed integer not null default 0,
  last_scored_at timestamptz,
  last_active_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique (classroom_id, user_id)
);
create unique index participants_nickname_idx on public.participants (classroom_id, lower(nickname));

-- Grading metadata (titles, difficulty, concepts) mirrored from src/game.
-- Answer keys live in the Edge Function bundle, not in a client-readable table.
create table public.challenge_catalog (
  id text primary key,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  title text not null,
  concepts text[] not null default '{}',
  base_points integer not null,
  sort_order integer not null,
  content_version integer not null
);

create table public.attempts (
  id bigint generated always as identity primary key,
  idempotency_key uuid not null unique,
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  challenge_id text not null references public.challenge_catalog (id),
  attempt_number integer not null,
  answer jsonb not null,
  correct boolean not null,
  hints_used integer not null default 0,
  points_awarded integer not null default 0,
  feedback text,
  created_at timestamptz not null default now()
);
create index attempts_participant_idx on public.attempts (participant_id, challenge_id);
create index attempts_rate_idx on public.attempts (participant_id, created_at);
create index attempts_classroom_idx on public.attempts (classroom_id, challenge_id);

create table public.completions (
  participant_id uuid not null references public.participants (id) on delete cascade,
  challenge_id text not null references public.challenge_catalog (id),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  difficulty text not null,
  points integer not null check (points >= 0),
  attempts integer not null,
  hints_used integer not null,
  completed_at timestamptz not null default now(),
  primary key (participant_id, challenge_id)
);
create index completions_classroom_idx on public.completions (classroom_id);

create table public.hint_usage (
  participant_id uuid not null references public.participants (id) on delete cascade,
  challenge_id text not null references public.challenge_catalog (id),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  hint_index integer not null check (hint_index between 0 and 9),
  created_at timestamptz not null default now(),
  primary key (participant_id, challenge_id, hint_index)
);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so RLS policies can use them without recursion)

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teachers t where t.user_id = auth.uid())
$$;

create or replace function public.owns_classroom(p_classroom uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classrooms c where c.id = p_classroom and c.owner_id = auth.uid())
$$;

create or replace function public.is_member(p_classroom uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.participants p where p.classroom_id = p_classroom and p.user_id = auth.uid())
$$;

-- Keeps participant totals in sync with completions (the only source of points).
create or replace function public.refresh_participant_totals(p_participant uuid) returns void
language sql security definer set search_path = public as $$
  update public.participants p set
    total_points = coalesce((select sum(points) from public.completions c where c.participant_id = p.id), 0),
    easy_completed = (select count(*) from public.completions c where c.participant_id = p.id and c.difficulty = 'easy'),
    medium_completed = (select count(*) from public.completions c where c.participant_id = p.id and c.difficulty = 'medium'),
    hard_completed = (select count(*) from public.completions c where c.participant_id = p.id and c.difficulty = 'hard'),
    last_scored_at = (select max(completed_at) from public.completions c where c.participant_id = p.id and c.points > 0)
  where p.id = p_participant
$$;

create or replace function public.completions_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_participant_totals(coalesce(new.participant_id, old.participant_id));
  return null;
end $$;

create trigger completions_totals
after insert or update or delete on public.completions
for each row execute function public.completions_after_change();

-- ---------------------------------------------------------------------------
-- Row Level Security: read-only, least privilege. No client write policies.

alter table public.teachers enable row level security;
alter table public.classrooms enable row level security;
alter table public.participants enable row level security;
alter table public.challenge_catalog enable row level security;
alter table public.attempts enable row level security;
alter table public.completions enable row level security;
alter table public.hint_usage enable row level security;

create policy teachers_self_read on public.teachers for select to authenticated using (user_id = auth.uid());

create policy classrooms_read on public.classrooms for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));

-- Students read only their own row; everyone else's scores come through classroom_leaderboard().
create policy participants_read on public.participants for select to authenticated
  using (public.owns_classroom(classroom_id) or user_id = auth.uid());

create policy catalog_read on public.challenge_catalog for select to anon, authenticated using (true);

create policy attempts_read on public.attempts for select to authenticated
  using (
    public.owns_classroom(classroom_id)
    or participant_id in (select id from public.participants where user_id = auth.uid())
  );

create policy completions_read on public.completions for select to authenticated
  using (
    public.owns_classroom(classroom_id)
    or participant_id in (select id from public.participants where user_id = auth.uid())
  );

create policy hints_read on public.hint_usage for select to authenticated
  using (
    public.owns_classroom(classroom_id)
    or participant_id in (select id from public.participants where user_id = auth.uid())
  );

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant select on public.challenge_catalog to anon;

-- ---------------------------------------------------------------------------
-- Student RPCs

-- Join (or re-join) a classroom with a nickname. Requires an auth session (anonymous is fine).
create or replace function public.join_classroom(p_code text, p_nickname text)
returns table (participant_id uuid, classroom_id uuid, classroom_name text, nickname text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room public.classrooms;
  v_participant public.participants;
  v_nick text := regexp_replace(btrim(p_nickname), '\s+', ' ', 'g');
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into v_room from public.classrooms where join_code = upper(btrim(p_code));
  if not found then raise exception 'No classroom uses that join code' using errcode = 'P0002'; end if;
  if v_room.status = 'closed' then raise exception 'This competition is closed' using errcode = 'P0001'; end if;
  if v_nick !~ '^[A-Za-z0-9 _.!''-]{2,24}$' then
    raise exception 'Nickname must be 2-24 letters, numbers, spaces, or _ - . ! ''' using errcode = '22023';
  end if;

  select * into v_participant from public.participants p where p.classroom_id = v_room.id and p.user_id = v_uid;
  if found then
    return query select v_participant.id, v_room.id, v_room.name, v_participant.nickname;
    return;
  end if;

  if exists (select 1 from public.participants p where p.classroom_id = v_room.id and lower(p.nickname) = lower(v_nick)) then
    raise exception 'That team nickname is already taken in this classroom' using errcode = '23505';
  end if;
  if (select count(*) from public.participants p where p.classroom_id = v_room.id) >= 200 then
    raise exception 'This classroom is full' using errcode = 'P0001';
  end if;

  insert into public.participants (classroom_id, user_id, nickname) values (v_room.id, v_uid, v_nick)
  returning * into v_participant;
  return query select v_participant.id, v_room.id, v_room.name, v_participant.nickname;
end $$;

-- Record that a hint was revealed. Server-side hint counts drive hint penalties.
create or replace function public.record_hint(p_classroom uuid, p_challenge text, p_hint_index integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_participant uuid;
begin
  select id into v_participant from public.participants where classroom_id = p_classroom and user_id = auth.uid();
  if v_participant is null then raise exception 'Not a member of this classroom' using errcode = '42501'; end if;
  if not exists (select 1 from public.challenge_catalog where id = p_challenge) then
    raise exception 'Unknown challenge' using errcode = '22023';
  end if;
  insert into public.hint_usage (participant_id, challenge_id, classroom_id, hint_index)
  values (v_participant, p_challenge, p_classroom, p_hint_index)
  on conflict do nothing;
  update public.participants set last_active_at = now() where id = v_participant;
end $$;

-- Public leaderboard rows for one classroom (respects "rankings hidden" for students).
create or replace function public.classroom_leaderboard(p_classroom uuid)
returns table (
  participant_id uuid, nickname text, total_points integer, easy_completed integer,
  medium_completed integer, hard_completed integer, last_scored_at timestamptz, is_me boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner boolean := public.owns_classroom(p_classroom);
  v_hidden boolean;
begin
  if not v_owner and not public.is_member(p_classroom) then
    raise exception 'Not a member of this classroom' using errcode = '42501';
  end if;
  select rankings_hidden into v_hidden from public.classrooms where id = p_classroom;
  return query
    select p.id, p.nickname,
      case when v_hidden and not v_owner and p.user_id <> auth.uid() then 0 else p.total_points end,
      case when v_hidden and not v_owner and p.user_id <> auth.uid() then 0 else p.easy_completed end,
      case when v_hidden and not v_owner and p.user_id <> auth.uid() then 0 else p.medium_completed end,
      case when v_hidden and not v_owner and p.user_id <> auth.uid() then 0 else p.hard_completed end,
      p.last_scored_at, p.user_id = auth.uid()
    from public.participants p
    where p.classroom_id = p_classroom
    order by p.total_points desc, p.last_scored_at asc nulls last, p.nickname;
end $$;

-- Overall rankings across every classroom (nicknames and points only).
create or replace function public.global_leaderboard(p_limit integer default 50)
returns table (
  nickname text, classroom_name text, total_points integer, easy_completed integer,
  medium_completed integer, hard_completed integer, last_scored_at timestamptz, is_me boolean
)
language sql stable security definer set search_path = public as $$
  select p.nickname, c.name, p.total_points, p.easy_completed, p.medium_completed, p.hard_completed,
         p.last_scored_at, p.user_id = auth.uid()
  from public.participants p join public.classrooms c on c.id = p.classroom_id
  where p.total_points > 0 and not c.rankings_hidden
  order by p.total_points desc, p.last_scored_at asc nulls last
  limit least(greatest(p_limit, 1), 100)
$$;

-- ---------------------------------------------------------------------------
-- Teacher RPCs (all check is_teacher / ownership server-side)

create or replace function public.generate_join_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classrooms where join_code = v_code);
  end loop;
  return v_code;
end $$;

create or replace function public.create_classroom(p_name text, p_duration_minutes integer, p_difficulties text[])
returns public.classrooms language plpgsql security definer set search_path = public as $$
declare
  v_room public.classrooms;
begin
  if not public.is_teacher() then raise exception 'Teacher access required' using errcode = '42501'; end if;
  insert into public.classrooms (owner_id, name, join_code, duration_minutes, enabled_difficulties)
  values (auth.uid(), btrim(p_name), public.generate_join_code(), p_duration_minutes, p_difficulties)
  returning * into v_room;
  return v_room;
end $$;

create or replace function public.update_classroom(
  p_classroom uuid, p_name text, p_duration_minutes integer, p_difficulties text[], p_rankings_hidden boolean
) returns public.classrooms language plpgsql security definer set search_path = public as $$
declare
  v_room public.classrooms;
begin
  if not public.owns_classroom(p_classroom) then raise exception 'Not your classroom' using errcode = '42501'; end if;
  update public.classrooms set
    name = coalesce(btrim(p_name), name),
    duration_minutes = coalesce(p_duration_minutes, duration_minutes),
    enabled_difficulties = coalesce(p_difficulties, enabled_difficulties),
    rankings_hidden = coalesce(p_rankings_hidden, rankings_hidden),
    ends_at = case when status = 'running' and p_duration_minutes is not null
                   then started_at + make_interval(mins => p_duration_minutes) else ends_at end
  where id = p_classroom
  returning * into v_room;
  return v_room;
end $$;

create or replace function public.start_classroom(p_classroom uuid)
returns public.classrooms language plpgsql security definer set search_path = public as $$
declare
  v_room public.classrooms;
begin
  if not public.owns_classroom(p_classroom) then raise exception 'Not your classroom' using errcode = '42501'; end if;
  update public.classrooms set
    status = 'running', started_at = now(), ends_at = now() + make_interval(mins => duration_minutes), closed_at = null
  where id = p_classroom
  returning * into v_room;
  return v_room;
end $$;

create or replace function public.close_classroom(p_classroom uuid)
returns public.classrooms language plpgsql security definer set search_path = public as $$
declare
  v_room public.classrooms;
begin
  if not public.owns_classroom(p_classroom) then raise exception 'Not your classroom' using errcode = '42501'; end if;
  update public.classrooms set status = 'closed', closed_at = now(), ends_at = least(coalesce(ends_at, now()), now())
  where id = p_classroom
  returning * into v_room;
  return v_room;
end $$;

create or replace function public.reset_classroom_scores(p_classroom uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_classroom(p_classroom) then raise exception 'Not your classroom' using errcode = '42501'; end if;
  delete from public.attempts where classroom_id = p_classroom;
  delete from public.hint_usage where classroom_id = p_classroom;
  delete from public.completions where classroom_id = p_classroom;
  update public.participants set total_points = 0, easy_completed = 0, medium_completed = 0, hard_completed = 0,
    last_scored_at = null where classroom_id = p_classroom;
  update public.classrooms set status = 'lobby', started_at = null, ends_at = null, closed_at = null
  where id = p_classroom;
end $$;

create or replace function public.remove_participant(p_participant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room uuid;
begin
  select classroom_id into v_room from public.participants where id = p_participant;
  if v_room is null or not public.owns_classroom(v_room) then raise exception 'Not your classroom' using errcode = '42501'; end if;
  delete from public.participants where id = p_participant;
end $$;

create or replace function public.delete_classroom(p_classroom uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_classroom(p_classroom) then raise exception 'Not your classroom' using errcode = '42501'; end if;
  delete from public.classrooms where id = p_classroom;
end $$;

-- Per-challenge statistics for the teacher dashboard.
create or replace function public.classroom_challenge_stats(p_classroom uuid)
returns table (
  challenge_id text, title text, difficulty text, concepts text[], sort_order integer,
  teams_attempted bigint, teams_completed bigint, total_attempts bigint, wrong_attempts bigint,
  hints_used bigint, avg_attempts_to_solve numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_classroom(p_classroom) then raise exception 'Not your classroom' using errcode = '42501'; end if;
  return query
    select cc.id, cc.title, cc.difficulty, cc.concepts, cc.sort_order,
      (select count(distinct a.participant_id) from public.attempts a where a.classroom_id = p_classroom and a.challenge_id = cc.id),
      (select count(*) from public.completions c where c.classroom_id = p_classroom and c.challenge_id = cc.id),
      (select count(*) from public.attempts a where a.classroom_id = p_classroom and a.challenge_id = cc.id),
      (select count(*) from public.attempts a where a.classroom_id = p_classroom and a.challenge_id = cc.id and not a.correct),
      (select count(*) from public.hint_usage h where h.classroom_id = p_classroom and h.challenge_id = cc.id),
      (select round(avg(c.attempts)::numeric, 2) from public.completions c where c.classroom_id = p_classroom and c.challenge_id = cc.id)
    from public.challenge_catalog cc
    order by cc.sort_order;
end $$;

-- Function grants: only what each role needs.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_teacher(),
  public.owns_classroom(uuid),
  public.is_member(uuid),
  public.join_classroom(text, text),
  public.record_hint(uuid, text, integer),
  public.classroom_leaderboard(uuid),
  public.global_leaderboard(integer),
  public.create_classroom(text, integer, text[]),
  public.update_classroom(uuid, text, integer, text[], boolean),
  public.start_classroom(uuid),
  public.close_classroom(uuid),
  public.reset_classroom_scores(uuid),
  public.remove_participant(uuid),
  public.delete_classroom(uuid),
  public.classroom_challenge_stats(uuid)
to authenticated;
grant execute on function public.global_leaderboard(integer) to anon;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast participant and classroom changes (RLS still applies).
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.classrooms;
