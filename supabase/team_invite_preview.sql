-- Run after teams.sql in Supabase Dashboard > SQL Editor.
-- This deliberately exposes only the small preview shown to anyone holding
-- the unguessable invite URL. It never exposes user IDs or the team roster.

create or replace function public.get_team_invite_preview(p_invite_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  invited_team public.teams%rowtype;
  inviter_name text;
  roster_count integer;
begin
  select * into invited_team
  from public.teams
  where invite_code::text = p_invite_code;

  if not found then
    return jsonb_build_object('valid', false, 'message', 'This team invitation is invalid or no longer available.');
  end if;

  select coalesce(nullif(trim(display_name), ''), 'A PLAYYR player')
  into inviter_name
  from public.team_members
  where team_id = invited_team.id and user_id = invited_team.creator_id;

  select count(*) into roster_count
  from public.team_members
  where team_id = invited_team.id;

  return jsonb_build_object(
    'valid', true,
    'inviter_name', coalesce(inviter_name, 'A PLAYYR player'),
    'team_name', invited_team.name,
    'sport', invited_team.sport,
    'member_count', roster_count,
    'max_members', invited_team.max_members,
    'is_full', roster_count >= invited_team.max_members
  );
end;
$$;

revoke all on function public.get_team_invite_preview(text) from public;
grant execute on function public.get_team_invite_preview(text) to anon, authenticated;
