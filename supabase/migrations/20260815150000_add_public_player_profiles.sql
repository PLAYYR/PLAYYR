alter table public.profiles
  add column if not exists bio text;

alter table public.profiles
  drop constraint if exists profiles_bio_length;

alter table public.profiles
  add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 300);

create or replace function public.get_public_profile(p_user_id uuid)
returns table (id uuid, full_name text, bio text, sports text[], city text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.bio, p.sports, p.city
  from public.profiles p
  where p.id = p_user_id
    and (coalesce(p.discoverable, true) or p.id = (select auth.uid()));
end;
$$;

revoke all on function public.get_public_profile(uuid) from public;
revoke execute on function public.get_public_profile(uuid) from anon;
grant execute on function public.get_public_profile(uuid) to authenticated;

create or replace function public.get_find_teams()
returns table (
  team_id uuid,
  team_name text,
  sport text,
  max_members integer,
  member_count bigint,
  members jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select
    t.id,
    t.name,
    t.sport,
    t.max_members,
    count(tm.user_id),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'full_name', coalesce(nullif(trim(p.full_name), ''), nullif(trim(tm.display_name), ''), 'PLAYYR member'),
          'bio', coalesce(p.bio, ''),
          'sports', coalesce(p.sports, '{}'::text[]),
          'city', coalesce(p.city, '')
        ) order by tm.joined_at
      ) filter (where p.id is not null and coalesce(p.discoverable, true)),
      '[]'::jsonb
    )
  from public.teams t
  left join public.team_members tm on tm.team_id = t.id
  left join public.profiles p on p.id = tm.user_id
  group by t.id, t.name, t.sport, t.max_members
  order by t.created_at desc;
end;
$$;

revoke all on function public.get_find_teams() from public;
revoke execute on function public.get_find_teams() from anon;
grant execute on function public.get_find_teams() to authenticated;
