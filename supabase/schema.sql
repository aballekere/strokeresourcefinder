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
  source text not null default 'Student entry',
  created_at timestamptz not null default now()
);

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
