
create table if not exists public.lucky21_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  state jsonb not null,
  version bigint not null default 1,
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

alter table public.lucky21_rooms enable row level security;
revoke all on public.lucky21_rooms from anon, authenticated;
grant select on public.lucky21_rooms to authenticated;

drop policy if exists "Lucky 21 members can read their room" on public.lucky21_rooms;
create policy "Lucky 21 members can read their room"
on public.lucky21_rooms for select to authenticated
using (auth.uid() = host_id or auth.uid() = guest_id);

create or replace function public.lucky21_room_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for index in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.lucky21_create_room(p_display_name text, p_state jsonb)
returns public.lucky21_rooms
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  created public.lucky21_rooms;
  candidate text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_state) <> 'object' then raise exception 'Invalid state'; end if;
  for attempt in 1..20 loop
    candidate := public.lucky21_room_code();
    begin
      insert into public.lucky21_rooms(code, host_id, state)
      values (candidate, auth.uid(), p_state)
      returning * into created;
      return created;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'Unable to allocate a room code';
end;
$$;

create or replace function public.lucky21_join_room(p_code text, p_display_name text)
returns public.lucky21_rooms
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  joined public.lucky21_rooms;
  normalized text := upper(trim(p_code));
  memory_seconds integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into joined from public.lucky21_rooms
  where code = normalized and expires_at > now()
  for update;
  if joined.id is null then raise exception 'Room not found'; end if;
  if joined.guest_id is not null and joined.guest_id <> auth.uid() then raise exception 'Room full'; end if;
  memory_seconds := greatest(5, least(60, coalesce((joined.state->>'memorySeconds')::integer, 15)));
  update public.lucky21_rooms
  set guest_id = auth.uid(),
      status = 'playing',
      state = jsonb_set(
        jsonb_set(
          jsonb_set(joined.state, '{players,1,name}', to_jsonb(left(coalesce(nullif(trim(p_display_name), ''), 'Joueur 2'), 24)), true),
          '{phase}', '"memory"'::jsonb, true
        ),
        '{memoryUntil}', to_jsonb((extract(epoch from (clock_timestamp() + make_interval(secs => memory_seconds))) * 1000)::bigint), true
      ),
      version = version + 1,
      updated_at = now()
  where id = joined.id
  returning * into joined;
  return joined;
end;
$$;

create or replace function public.lucky21_get_room(p_room_id uuid)
returns public.lucky21_rooms
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  result public.lucky21_rooms;
begin
  select * into result from public.lucky21_rooms
  where id = p_room_id and (host_id = auth.uid() or guest_id = auth.uid());
  if result.id is null then raise exception 'Room not found'; end if;
  return result;
end;
$$;

create or replace function public.lucky21_update_room(p_room_id uuid, p_expected_version bigint, p_state jsonb)
returns public.lucky21_rooms
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_room public.lucky21_rooms;
  updated public.lucky21_rooms;
  caller_seat integer;
  current_seat integer;
  current_phase text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_state) <> 'object' then raise exception 'Invalid state'; end if;
  select * into current_room from public.lucky21_rooms where id = p_room_id for update;
  if current_room.id is null then raise exception 'Room not found'; end if;
  if current_room.version <> p_expected_version then raise exception 'Version conflict'; end if;
  caller_seat := case when current_room.host_id = auth.uid() then 0 when current_room.guest_id = auth.uid() then 1 else -1 end;
  if caller_seat < 0 then raise exception 'Not a room member'; end if;
  current_seat := coalesce((current_room.state->>'currentPlayer')::integer, 0);
  current_phase := coalesce(current_room.state->>'phase', 'waiting');
  if current_phase not in ('waiting','memory','round-over','match-over') and caller_seat <> current_seat then
    raise exception 'Not your turn';
  end if;
  update public.lucky21_rooms
  set state = p_state,
      status = case when p_state->>'phase' = 'match-over' then 'finished' else status end,
      version = version + 1,
      updated_at = now()
  where id = p_room_id
  returning * into updated;
  return updated;
end;
$$;

create or replace function public.lucky21_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.lucky21_rooms
  set status = 'finished', version = version + 1, updated_at = now()
  where id = p_room_id and (host_id = auth.uid() or guest_id = auth.uid());
end;
$$;

grant execute on function public.lucky21_create_room(text, jsonb) to authenticated;
grant execute on function public.lucky21_join_room(text, text) to authenticated;
grant execute on function public.lucky21_get_room(uuid) to authenticated;
grant execute on function public.lucky21_update_room(uuid, bigint, jsonb) to authenticated;
grant execute on function public.lucky21_leave_room(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lucky21_rooms'
  ) then
    alter publication supabase_realtime add table public.lucky21_rooms;
  end if;
end $$;

create index if not exists lucky21_rooms_code_idx on public.lucky21_rooms(code);
create index if not exists lucky21_rooms_expires_idx on public.lucky21_rooms(expires_at);
