create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customers (id, full_name, phone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1), 'Customer'),
    coalesce(nullif(new.phone, ''), new.email, new.id::text)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer on auth.users;
create trigger on_auth_user_created_customer
after insert on auth.users
for each row execute function public.handle_new_customer();

insert into public.vouchers (name, description, emoji, points_cost, is_active)
values
  ('Free Eyebrow Tint', 'With any wax treatment', '*', 200, true),
  ('Free Lip Wax', 'Upper or lower lip', '*', 150, true),
  ('10% Off Next Visit', 'Any treatment', '*', 500, true),
  ('Free Hollywood Wax', 'Worth GBP 45', '*', 1000, true)
on conflict do nothing;

revoke execute on function public.add_points(uuid, integer, text, text, uuid) from anon;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.handle_new_customer() from anon, authenticated;
grant execute on function public.add_points(uuid, integer, text, text, uuid) to authenticated;
