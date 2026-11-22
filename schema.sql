create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text not null check (char_length(btrim(phone)) between 1 and 30),
  email text check (email is null or char_length(email) <= 254),
  address text check (address is null or char_length(address) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_id_owner_unique unique (id, owner_id)
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  customer_id uuid not null,
  brand text not null check (char_length(btrim(brand)) between 1 and 60),
  model text not null check (char_length(btrim(model)) between 1 and 80),
  license_plate text not null check (char_length(btrim(license_plate)) between 1 and 20),
  year integer check (year is null or year between 1950 and 2100),
  color text check (color is null or char_length(color) <= 40),
  transmission text check (transmission is null or char_length(transmission) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_license_plate_owner_unique unique (owner_id, license_plate),
  constraint vehicles_id_customer_owner_unique unique (id, customer_id, owner_id),
  constraint vehicles_customer_owner_fk foreign key (customer_id, owner_id)
    references public.customers(id, owner_id) on delete restrict
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  order_number text not null unique default (
    'WO-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  customer_id uuid not null,
  vehicle_id uuid not null,
  complaint text not null check (char_length(btrim(complaint)) between 1 and 2000),
  status text not null default 'Menunggu'
    check (status in ('Menunggu', 'Dalam proses', 'Siap diambil', 'Selesai', 'Dibatalkan')),
  estimated_cost numeric(14, 2) not null default 0 check (estimated_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_orders_customer_owner_fk
    foreign key (customer_id, owner_id)
    references public.customers(id, owner_id)
    on delete restrict,
  constraint work_orders_vehicle_owner_fk
    foreign key (vehicle_id, customer_id, owner_id)
    references public.vehicles(id, customer_id, owner_id)
    on delete restrict
);

alter table public.customers add column if not exists owner_id uuid references auth.users(id);
alter table public.vehicles add column if not exists owner_id uuid references auth.users(id);
alter table public.work_orders add column if not exists owner_id uuid references auth.users(id);

do $$
declare
  account_id uuid;
begin
  if exists (select 1 from public.customers where owner_id is null)
    or exists (select 1 from public.vehicles where owner_id is null)
    or exists (select 1 from public.work_orders where owner_id is null) then
    select id into account_id
    from auth.users
    where lower(email) = lower('GANTI_DENGAN_EMAIL_AKUN_PERTAMA')
    limit 1;

    if account_id is null then
      raise exception 'Data lama ditemukan. Ganti GANTI_DENGAN_EMAIL_AKUN_PERTAMA dengan email akun RodaKerja pertama yang sudah terdaftar.';
    end if;

    update public.customers set owner_id = account_id where owner_id is null;
    update public.vehicles set owner_id = account_id where owner_id is null;
    update public.work_orders set owner_id = account_id where owner_id is null;
  end if;
end
$$;

alter table public.customers alter column owner_id set default auth.uid();
alter table public.vehicles alter column owner_id set default auth.uid();
alter table public.work_orders alter column owner_id set default auth.uid();
alter table public.customers alter column owner_id set not null;
alter table public.vehicles alter column owner_id set not null;
alter table public.work_orders alter column owner_id set not null;

create unique index if not exists customers_id_owner_unique on public.customers(id, owner_id);
create unique index if not exists vehicles_id_customer_owner_unique on public.vehicles(id, customer_id, owner_id);
alter table public.vehicles drop constraint if exists vehicles_license_plate_unique;
alter table public.vehicles drop constraint if exists vehicles_license_plate_owner_unique;
alter table public.vehicles add constraint vehicles_license_plate_owner_unique unique (owner_id, license_plate);

alter table public.vehicles drop constraint if exists vehicles_customer_id_fkey;
alter table public.vehicles drop constraint if exists vehicles_customer_owner_fk;
alter table public.vehicles add constraint vehicles_customer_owner_fk
  foreign key (customer_id, owner_id) references public.customers(id, owner_id) on delete restrict;

alter table public.work_orders drop constraint if exists work_orders_customer_id_fkey;
alter table public.work_orders drop constraint if exists work_orders_customer_owner_fk;
alter table public.work_orders add constraint work_orders_customer_owner_fk
  foreign key (customer_id, owner_id) references public.customers(id, owner_id) on delete restrict;
alter table public.work_orders drop constraint if exists work_orders_vehicle_owner_fk;
alter table public.work_orders add constraint work_orders_vehicle_owner_fk
  foreign key (vehicle_id, customer_id, owner_id)
  references public.vehicles(id, customer_id, owner_id) on delete restrict;

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
drop policy if exists "Owners can manage customers" on public.customers;
create policy "Owners can manage customers" on public.customers
for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Public demo can manage vehicles" on public.vehicles;
drop policy if exists "Owners can manage vehicles" on public.vehicles;
create policy "Owners can manage vehicles" on public.vehicles
for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Public demo can manage work orders" on public.work_orders;
drop policy if exists "Owners can manage work orders" on public.work_orders;
create policy "Owners can manage work orders" on public.work_orders
for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant usage on schema public to authenticated;
revoke all on public.customers, public.vehicles, public.work_orders from anon;
grant select, insert, update, delete on public.customers, public.vehicles, public.work_orders to authenticated;
