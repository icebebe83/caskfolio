create policy "bottles_delete_admin" on public.bottles
for delete to authenticated using (public.is_admin());
