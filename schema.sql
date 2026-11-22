create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text not null check (char_length(btrim(phone)) between 1 and 30),
  email text check (email is null or char_length(email) <= 254),
  address text check (address is null or char_length(address) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  brand text not null check (char_length(btrim(brand)) between 1 and 60),
  model text not null check (char_length(btrim(model)) between 1 and 80),
  license_plate text not null check (char_length(btrim(license_plate)) between 1 and 20),
  year integer check (year is null or year between 1950 and 2100),
  color text check (color is null or char_length(color) <= 40),
  transmission text check (transmission is null or char_length(transmission) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_license_plate_unique unique (license_plate),
  constraint vehicles_id_customer_unique unique (id, customer_id)
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default (
    'WO-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid not null,
  complaint text not null check (char_length(btrim(complaint)) between 1 and 2000),
  status text not null default 'Menunggu'
    check (status in ('Menunggu', 'Dalam proses', 'Siap diambil', 'Selesai', 'Dibatalkan')),
  estimated_cost numeric(14, 2) not null default 0 check (estimated_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_orders_vehicle_owner_fk
    foreign key (vehicle_id, customer_id)
    references public.vehicles(id, customer_id)
    on delete restrict
);

create index if not exists vehicles_customer_id_idx on public.vehicles(customer_id);
create index if not exists work_orders_customer_id_idx on public.work_orders(customer_id);
create index if not exists work_orders_vehicle_id_idx on public.work_orders(vehicle_id);
create index if not exists work_orders_status_idx on public.work_orders(status);
create index if not exists work_orders_created_at_idx on public.work_orders(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at before update on public.vehicles
for each row execute function public.set_updated_at();

drop trigger if exists work_orders_set_updated_at on public.work_orders;
create trigger work_orders_set_updated_at before update on public.work_orders
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.work_orders enable row level security;

drop policy if exists "Public demo can manage customers" on public.customers;
create policy "Public demo can manage customers" on public.customers
for all to anon, authenticated using (true) with check (true);

drop policy if exists "Public demo can manage vehicles" on public.vehicles;
create policy "Public demo can manage vehicles" on public.vehicles
for all to anon, authenticated using (true) with check (true);

drop policy if exists "Public demo can manage work orders" on public.work_orders;
create policy "Public demo can manage work orders" on public.work_orders
for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.customers to anon, authenticated;
grant select, insert, update, delete on public.vehicles to anon, authenticated;
grant select, insert, update, delete on public.work_orders to anon, authenticated;
