create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  march_seconds integer not null check (march_seconds >= 0),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_rallies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rally_remaining_seconds integer not null check (rally_remaining_seconds >= 0),
  enemy_march_seconds integer not null check (enemy_march_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();

drop trigger if exists shared_rallies_set_updated_at on public.shared_rallies;
create trigger shared_rallies_set_updated_at
before update on public.shared_rallies
for each row execute function public.set_updated_at();

alter table public.members enable row level security;
alter table public.shared_rallies enable row level security;
