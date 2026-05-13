create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer','therapist','admin')),
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key references public.profiles(id) on delete cascade,
  email text not null unique,
  points_balance int not null default 0 check (points_balance >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.therapists (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  location text,
  active boolean not null default true
);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  cost_points int not null check (cost_points > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  voucher_id uuid not null references public.vouchers(id),
  therapist_id uuid not null references public.therapists(user_id),
  cost_points int not null,
  redeemed_at timestamptz not null default now()
);

create table if not exists public.points_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  therapist_id uuid references public.therapists(user_id),
  delta_points int not null,
  reason text not null,
  redemption_id uuid references public.redemptions(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_points_transactions_customer_created
  on public.points_transactions(customer_id, created_at desc);
create index if not exists idx_redemptions_customer_redeemed
  on public.redemptions(customer_id, redeemed_at desc);
create index if not exists idx_customers_email on public.customers(email);

create or replace function public.guard_points_non_negative()
returns trigger
language plpgsql
as $$
declare current_balance int;
begin
  select points_balance into current_balance
  from public.customers where id = new.customer_id for update;

  if current_balance + new.delta_points < 0 then
    raise exception 'insufficient points';
  end if;

  return new;
end;
$$;

create or replace function public.apply_points_delta()
returns trigger
language plpgsql
as $$
begin
  update public.customers
  set points_balance = points_balance + new.delta_points
  where id = new.customer_id;

  return new;
end;
$$;

drop trigger if exists trg_guard_points_non_negative on public.points_transactions;
create trigger trg_guard_points_non_negative
before insert on public.points_transactions
for each row execute function public.guard_points_non_negative();

drop trigger if exists trg_apply_points_delta on public.points_transactions;
create trigger trg_apply_points_delta
after insert on public.points_transactions
for each row execute function public.apply_points_delta();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, role) values (new.id, 'customer') on conflict do nothing;
  insert into public.customers(id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
