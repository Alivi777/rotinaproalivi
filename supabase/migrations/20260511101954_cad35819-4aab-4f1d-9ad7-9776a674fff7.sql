DELETE FROM public.client_task_items WHERE client_id IN (SELECT id FROM public.clients WHERE sector_id = (SELECT id FROM public.sectors WHERE slug='recepcao'));
DELETE FROM public.client_tasks WHERE client_id IN (SELECT id FROM public.clients WHERE sector_id = (SELECT id FROM public.sectors WHERE slug='recepcao'));
DELETE FROM public.client_notes WHERE client_id IN (SELECT id FROM public.clients WHERE sector_id = (SELECT id FROM public.sectors WHERE slug='recepcao'));
DELETE FROM public.clients WHERE sector_id = (SELECT id FROM public.sectors WHERE slug='recepcao');
DELETE FROM public.clinic_daily_tasks;
DELETE FROM public.clinic_appointments;