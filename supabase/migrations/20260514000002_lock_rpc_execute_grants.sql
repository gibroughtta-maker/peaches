revoke execute on function public.add_points(uuid, integer, text, text, uuid) from public;
revoke execute on function public.handle_new_customer() from public;
revoke execute on function public.rls_auto_enable() from public;

grant execute on function public.add_points(uuid, integer, text, text, uuid) to authenticated;
