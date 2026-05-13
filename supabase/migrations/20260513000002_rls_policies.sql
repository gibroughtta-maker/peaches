create or replace function public.is_therapist()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('therapist','admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.therapists enable row level security;
alter table public.vouchers enable row level security;
alter table public.points_transactions enable row level security;
alter table public.redemptions enable row level security;

create policy profiles_select on public.profiles for select
using (id = auth.uid() or public.is_therapist());

create policy profiles_update_self on public.profiles for update
using (id = auth.uid()) with check (id = auth.uid());

create policy customers_select on public.customers for select
using (id = auth.uid() or public.is_therapist());

create policy therapists_select on public.therapists for select
using (auth.uid() is not null);

create policy vouchers_select on public.vouchers for select
using (active = true);

create policy tx_select on public.points_transactions for select
using (customer_id = auth.uid() or public.is_therapist());

create policy tx_insert_therapist on public.points_transactions for insert
with check (public.is_therapist() and therapist_id = auth.uid());

create policy redemptions_select on public.redemptions for select
using (customer_id = auth.uid() or public.is_therapist());

create policy redemptions_insert_therapist on public.redemptions for insert
with check (public.is_therapist() and therapist_id = auth.uid());
