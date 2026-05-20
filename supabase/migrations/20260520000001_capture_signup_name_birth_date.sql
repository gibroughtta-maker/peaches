alter table public.staff
add column if not exists birth_date date;

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
    coalesce(nullif(new.phone, ''), new.email, new.id::text),
    v_birth_date
  )
  on conflict (id) do update
    set full_name = coalesce(nullif(excluded.full_name, ''), public.customers.full_name),
        birth_date = coalesce(excluded.birth_date, public.customers.birth_date);

  return new;
end;
$$;

revoke execute on function public.handle_new_customer() from anon, authenticated;
