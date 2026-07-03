
-- Função auxiliar: verifica se o usuário pertence ao setor com o slug informado
create or replace function public.user_in_sector(_user_id uuid, _slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.sectors s on s.id = p.sector_id
    where p.user_id = _user_id
      and s.slug = _slug
  );
$$;

-- =========================================================
-- time_clock_correction_requests
-- =========================================================
drop policy if exists "Admins manage requests" on public.time_clock_correction_requests;
drop policy if exists "Admins or financeiro manage requests" on public.time_clock_correction_requests;
create policy "Admins or financeiro manage requests"
on public.time_clock_correction_requests
for all
to authenticated
using (
  has_role(auth.uid(), 'admin'::app_role)
  or public.user_in_sector(auth.uid(), 'financeiro')
)
with check (
  has_role(auth.uid(), 'admin'::app_role)
  or public.user_in_sector(auth.uid(), 'financeiro')
);

drop policy if exists "Requests viewable by owner or admin" on public.time_clock_correction_requests;
drop policy if exists "Requests viewable by owner admin or financeiro" on public.time_clock_correction_requests;
create policy "Requests viewable by owner admin or financeiro"
on public.time_clock_correction_requests
for select
to authenticated
using (
  auth.uid() = user_id
  or has_role(auth.uid(), 'admin'::app_role)
  or public.user_in_sector(auth.uid(), 'financeiro')
);

-- =========================================================
-- time_clock_entries
-- =========================================================
drop policy if exists "Admins manage entries" on public.time_clock_entries;
drop policy if exists "Admins or financeiro manage entries" on public.time_clock_entries;
create policy "Admins or financeiro manage entries"
on public.time_clock_entries
for all
to authenticated
using (
  has_role(auth.uid(), 'admin'::app_role)
  or public.user_in_sector(auth.uid(), 'financeiro')
)
with check (
  has_role(auth.uid(), 'admin'::app_role)
  or public.user_in_sector(auth.uid(), 'financeiro')
);

drop policy if exists "Entries viewable by owner or admin" on public.time_clock_entries;
drop policy if exists "Entries viewable by owner admin or financeiro" on public.time_clock_entries;
create policy "Entries viewable by owner admin or financeiro"
on public.time_clock_entries
for select
to authenticated
using (
  auth.uid() = user_id
  or has_role(auth.uid(), 'admin'::app_role)
  or public.user_in_sector(auth.uid(), 'financeiro')
);

-- =========================================================
-- time_clock_edit_log  (sem user_id direto; dono via entry_id -> time_clock_entries.user_id)
-- =========================================================
drop policy if exists "Admins insert edit log" on public.time_clock_edit_log;
drop policy if exists "Admins or financeiro insert edit log" on public.time_clock_edit_log;
create policy "Admins or financeiro insert edit log"
on public.time_clock_edit_log
for insert
to authenticated
with check (
  (
    has_role(auth.uid(), 'admin'::app_role)
    or public.user_in_sector(auth.uid(), 'financeiro')
  )
  and auth.uid() = edited_by
);

drop policy if exists "Edit log viewable by admin or owner" on public.time_clock_edit_log;
drop policy if exists "Edit log viewable by owner admin or financeiro" on public.time_clock_edit_log;
create policy "Edit log viewable by owner admin or financeiro"
on public.time_clock_edit_log
for select
to authenticated
using (
  has_role(auth.uid(), 'admin'::app_role)
  or public.user_in_sector(auth.uid(), 'financeiro')
  or exists (
    select 1 from public.time_clock_entries e
    where e.id = time_clock_edit_log.entry_id
      and e.user_id = auth.uid()
  )
);
