create policy "news_insert_admin" on public.news
for insert to authenticated with check (public.is_admin());

create policy "news_update_admin" on public.news
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "news_delete_admin" on public.news
for delete to authenticated using (public.is_admin());
