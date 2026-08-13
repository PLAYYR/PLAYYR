-- Run once in Supabase Dashboard > SQL Editor after teams.sql.
-- Replaces the original void RPC with a result the UI can verify.

drop function if exists public.remove_team_member(uuid, uuid);

create function public.remove_team_member(p_team_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
  removed_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage this team';
  end if;

  select creator_id into owner_id
  from public.teams
  where id = p_team_id;

  if owner_id is null then
    raise exception 'Team not found';
  end if;
  if owner_id <> auth.uid() then
    raise exception 'Only the team creator can remove members';
  end if;
  if p_user_id = owner_id then
    raise exception 'The creator cannot be removed from their own team';
  end if;

  delete from public.team_members
  where team_id = p_team_id and user_id = p_user_id;
  get diagnostics removed_count = row_count;

  if removed_count = 0 then
    return jsonb_build_object('removed', false, 'message', 'This player is no longer in the team');
  end if;

  return jsonb_build_object('removed', true, 'message', 'Player removed from the team');
end;
$$;

revoke all on function public.remove_team_member(uuid, uuid) from public;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
