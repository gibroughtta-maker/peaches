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
    raise exception 'Invalid customer QR code';
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
  set updated_at = now()
  where customer_id = p_customer_id;

  return v_tx;
end;
$$;

revoke execute on function public.add_points(uuid, integer, text, text, uuid, text) from anon, public;
grant execute on function public.add_points(uuid, integer, text, text, uuid, text) to authenticated;

create or replace function public.smoothest_peaches(
  p_months integer default 3,
  p_limit integer default 10
)
returns table (
  rank integer,
  customer_id uuid,
  full_name text,
  earned_points integer
)
language sql
security definer
set search_path = public
as $$
  with settings as (
    select
      greatest(1, least(coalesce(p_months, 3), 12))::integer as months,
      greatest(1, least(coalesce(p_limit, 10), 50))::integer as row_limit
  ),
  totals as (
    select
      c.id as customer_id,
      coalesce(nullif(c.full_name, ''), split_part(coalesce(c."Email", c.phone, c.id::text), '@', 1), 'Peaches Member') as full_name,
      coalesce(sum(
        case
          when t.type = 'earn' and t.points_delta > 0 then t.points_delta
          else 0
        end
      ), 0)::integer as earned_points
    from public.customers c
    cross join settings s
    left join public.transactions t
      on t.customer_id = c.id
     and t.created_at >= now() - make_interval(months => s.months)
     and t.created_at < now() + interval '1 second'
    group by c.id, c.full_name, c."Email", c.phone
  ),
  ranked as (
    select
      row_number() over (order by earned_points desc, full_name asc, customer_id asc)::integer as rank,
      customer_id,
      full_name,
      earned_points
    from totals
    where earned_points > 0
  )
  select ranked.rank, ranked.customer_id, ranked.full_name, ranked.earned_points
  from ranked, settings
  order by ranked.rank
  limit (select row_limit from settings);
$$;

revoke execute on function public.smoothest_peaches(integer, integer) from anon, public;
grant execute on function public.smoothest_peaches(integer, integer) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end;
$$;
