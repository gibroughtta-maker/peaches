create table if not exists public.customer_qr_tokens (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  token text not null default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_qr_tokens enable row level security;

drop policy if exists customer_select_own_qr_token on public.customer_qr_tokens;
create policy customer_select_own_qr_token
on public.customer_qr_tokens
for select
to authenticated
using ((select auth.uid()) = customer_id);

grant select on public.customer_qr_tokens to authenticated;

insert into public.customer_qr_tokens (customer_id)
select id from public.customers
on conflict (customer_id) do nothing;

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_birth_date date;
begin
  if (new.raw_user_meta_data ->> 'birth_date') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_birth_date := (new.raw_user_meta_data ->> 'birth_date')::date;
  end if;

  insert into public.customers (id, full_name, phone, birth_date)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1), 'Customer'),
    coalesce(nullif(new.raw_user_meta_data ->> 'phone', ''), nullif(new.phone, ''), new.email, new.id::text),
    v_birth_date
  )
  on conflict (id) do update
    set full_name = coalesce(nullif(excluded.full_name, ''), public.customers.full_name),
        phone = coalesce(nullif(excluded.phone, ''), public.customers.phone),
        birth_date = coalesce(excluded.birth_date, public.customers.birth_date);

  insert into public.customer_qr_tokens (customer_id)
  values (new.id)
  on conflict (customer_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_customer() from anon, authenticated, public;

drop function if exists public.add_points(uuid, integer, text, text, uuid);

create or replace function public.add_points(
  p_customer_id uuid,
  p_delta integer,
  p_note text,
  p_type text,
  p_voucher_id uuid default null,
  p_qr_token text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transactions;
  v_current_balance integer;
  v_new_balance integer;
  v_voucher_cost integer;
  v_note text;
begin
  if not exists (select 1 from public.staff where id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  if nullif(p_qr_token, '') is null then
    raise exception 'Customer QR scan is required';
  end if;

  perform 1
  from public.customer_qr_tokens
  where customer_id = p_customer_id
    and token = p_qr_token
  for update;

  if not found then
    raise exception 'Invalid or expired customer QR code';
  end if;

  if p_type not in ('earn', 'redeem') then
    raise exception 'Invalid transaction type';
  end if;

  if p_type = 'earn' and p_delta <= 0 then
    raise exception 'Earn transactions must add points';
  end if;

  if p_type = 'redeem' and p_delta >= 0 then
    raise exception 'Redeem transactions must subtract points';
  end if;

  if p_type = 'earn' and p_voucher_id is not null then
    raise exception 'Earn transactions cannot include a voucher';
  end if;

  if p_type = 'redeem' then
    if p_voucher_id is null then
      raise exception 'Choose a voucher to redeem';
    end if;

    select points_cost into v_voucher_cost
    from public.vouchers
    where id = p_voucher_id
      and is_active = true;

    if v_voucher_cost is null then
      raise exception 'Voucher is not available';
    end if;

    if p_delta <> -v_voucher_cost then
      raise exception 'Voucher point cost does not match';
    end if;
  end if;

  select points into v_current_balance
  from public.customers
  where id = p_customer_id
  for update;

  if v_current_balance is null then
    raise exception 'Customer was not found';
  end if;

  v_new_balance := v_current_balance + p_delta;
  if v_new_balance < 0 then
    raise exception 'Insufficient points';
  end if;

  v_note := left(coalesce(nullif(trim(p_note), ''), case when p_type = 'earn' then 'Points added' else 'Reward redeemed' end), 280);

  insert into public.transactions (customer_id, type, points_delta, note, performed_by, voucher_id, is_reward_exempt)
  values (p_customer_id, p_type, p_delta, v_note, auth.uid(), p_voucher_id, p_type = 'redeem')
  returning * into v_tx;

  update public.customers
  set points = v_new_balance
  where id = p_customer_id;

  update public.customer_qr_tokens
  set token = encode(gen_random_bytes(24), 'hex'),
      updated_at = now()
  where customer_id = p_customer_id;

  return v_tx;
end;
$$;

revoke execute on function public.add_points(uuid, integer, text, text, uuid, text) from anon, public;
grant execute on function public.add_points(uuid, integer, text, text, uuid, text) to authenticated;
