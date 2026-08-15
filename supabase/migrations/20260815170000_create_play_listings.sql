create table if not exists public.play_listings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  sport text not null,
  level text not null,
  venue text not null check (char_length(venue) between 2 and 160),
  schedule text not null check (char_length(schedule) between 2 and 100),
  open_spots integer not null default 0 check (open_spots between 0 and 500),
  created_at timestamptz not null default now()
);

alter table public.play_listings enable row level security;
grant select, insert, update, delete on table public.play_listings to authenticated;

create policy "signed in users can view play listings"
on public.play_listings for select to authenticated using (true);

create policy "users can create play listings"
on public.play_listings for insert to authenticated
with check ((select auth.uid()) = creator_id);

create policy "users can update own play listings"
on public.play_listings for update to authenticated
using ((select auth.uid()) = creator_id)
with check ((select auth.uid()) = creator_id);

create policy "users can delete own play listings"
on public.play_listings for delete to authenticated
using ((select auth.uid()) = creator_id);

create index if not exists play_listings_sport_created_idx
on public.play_listings (sport, created_at desc);
