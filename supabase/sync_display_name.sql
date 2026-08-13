-- Run once in Supabase Dashboard > SQL Editor after teams.sql.
-- Keeps a user's team roster and invitation display name in sync.

create or replace function public.sync_my_team_display_name(p_full_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := trim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then
    raise exception 'Sign in to change your name';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'Name must be between 2 and 80 characters';
  end if;

  update public.team_members
  set display_name = clean_name
  where user_id = auth.uid();
end;
$$;

revoke all on function public.sync_my_team_display_name(text) from public;
grant execute on function public.sync_my_team_display_name(text) to authenticated;
