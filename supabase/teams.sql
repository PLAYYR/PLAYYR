-- Run once in Supabase Dashboard > SQL Editor for PLAYYR.
create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  sport text not null check (char_length(trim(sport)) between 2 and 40),
  max_members integer not null check (max_members between 2 and 100),
  creator_id uuid not null references auth.users(id) on delete cascade,
  invite_code uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'PLAYYR member',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_team_member(uuid) from public;
grant execute on function public.is_team_member(uuid) to authenticated;

drop policy if exists "members can read their teams" on public.teams;
create policy "members can read their teams" on public.teams
for select to authenticated using (creator_id = auth.uid() or public.is_team_member(id));

drop policy if exists "users can create their own teams" on public.teams;
create policy "users can create their own teams" on public.teams
for insert to authenticated with check (creator_id = auth.uid());

drop policy if exists "creators can update teams" on public.teams;
create policy "creators can update teams" on public.teams
for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());

drop policy if exists "creators can delete teams" on public.teams;
create policy "creators can delete teams" on public.teams
for delete to authenticated using (creator_id = auth.uid());

drop policy if exists "members can read their rosters" on public.team_members;
create policy "members can read their rosters" on public.team_members
for select to authenticated using (public.is_team_member(team_id));

create or replace function public.add_team_creator()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_name text;
begin
  select coalesce(nullif(trim(p.full_name), ''), nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(u.raw_user_meta_data ->> 'username'), ''), 'Team creator')
    into member_name
    from auth.users u left join public.profiles p on p.id = u.id
    where u.id = new.creator_id;
  insert into public.team_members(team_id, user_id, display_name)
  values (new.id, new.creator_id, coalesce(member_name, 'Team creator'))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists add_team_creator_after_insert on public.teams;
create trigger add_team_creator_after_insert
after insert on public.teams
for each row execute function public.add_team_creator();

create or replace function public.join_team_by_invite(p_invite_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.teams%rowtype;
  member_name text;
  current_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in to join this team'; end if;
  select * into target from public.teams where invite_code::text = p_invite_code for update;
  if not found then raise exception 'This invite link is invalid or expired'; end if;
  if exists (select 1 from public.team_members where team_id = target.id and user_id = auth.uid()) then return 'already_member'; end if;
  select count(*) into current_count from public.team_members where team_id = target.id;
  if current_count >= target.max_members then raise exception 'This team is already full'; end if;
  select coalesce(nullif(trim(p.full_name), ''), nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(u.raw_user_meta_data ->> 'username'), ''), 'PLAYYR member')
    into member_name
    from auth.users u left join public.profiles p on p.id = u.id
    where u.id = auth.uid();
  insert into public.team_members(team_id, user_id, display_name)
  values (target.id, auth.uid(), coalesce(member_name, 'PLAYYR member'));
  return 'joined';
end;
$$;

revoke all on function public.join_team_by_invite(text) from public;
grant execute on function public.join_team_by_invite(text) to authenticated;

create or replace function public.remove_team_member(p_team_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare owner_id uuid; removed_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in to manage this team'; end if;
  select creator_id into owner_id from public.teams where id = p_team_id;
  if owner_id is null then raise exception 'Team not found'; end if;
  if owner_id <> auth.uid() then raise exception 'Only the team creator can remove members'; end if;
  if p_user_id = owner_id then raise exception 'The creator cannot be removed from their own team'; end if;
  delete from public.team_members where team_id = p_team_id and user_id = p_user_id;
  get diagnostics removed_count = row_count;
  return jsonb_build_object(
    'removed', removed_count > 0,
    'message', case when removed_count > 0 then 'Player removed from the team' else 'This player is no longer in the team' end
  );
end;
$$;

revoke all on function public.remove_team_member(uuid, uuid) from public;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;

grant select, insert, update, delete on public.teams to authenticated;
grant select on public.team_members to authenticated;
