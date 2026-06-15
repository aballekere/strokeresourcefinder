create extension if not exists pgcrypto;

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  zip text not null check (zip ~ '^[0-9]{5}$'),
  category_key text not null,
  category text not null,
  name text not null,
  address text not null,
  phone text,
  website text,
  notes text,
  created_by text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  source text not null default 'Student entry',
  created_at timestamptz not null default now()
);

alter table public.resources
  add column if not exists status text not null default 'pending';

alter table public.resources
  add column if not exists reviewed_by text;

alter table public.resources
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'resources_status_check'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_status_check check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists resources_zip_category_created_idx
  on public.resources (zip, category_key, created_at desc);

grant usage on schema public to service_role;
grant select, insert, update, delete on public.resources to service_role;

alter table public.resources enable row level security;

create policy "Server service role manages resources"
  on public.resources
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.adi_context (
  zip text primary key check (zip ~ '^[0-9]{5}$'),
  geography text not null default 'ZCTA',
  reference_area text,
  year integer not null,
  adi numeric,
  financial_strength numeric,
  economic_hardship_and_inequality numeric,
  educational_attainment numeric,
  source text not null default 'sociome',
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.adi_context to service_role;

alter table public.adi_context enable row level security;

create policy "Server service role manages ADI context"
  on public.adi_context
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
