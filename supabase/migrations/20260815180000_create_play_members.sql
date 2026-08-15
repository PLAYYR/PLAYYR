create table if not exists public.play_members (
  listing_id uuid not null references public.play_listings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);

alter table public.play_members enable row level security;
grant select, insert, delete on table public.play_members to authenticated;

create policy "signed in users can view play members"
on public.play_members for select to authenticated using (true);

create policy "users can join plays"
on public.play_members for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can leave plays"
on public.play_members for delete to authenticated
using ((select auth.uid()) = user_id);

create index if not exists play_members_user_idx
on public.play_members (user_id);
