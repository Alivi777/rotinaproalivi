-- Mapeamento por volume de consultas + nomes do print Clinicorp
UPDATE public.clinic_doctors SET name='Wanessa Matzenbacher Carneiro', color='#A78BFA', active=true WHERE external_id='4553828117577728';
UPDATE public.clinic_doctors SET name='Agenda Geral', color='#FDE68A', active=true WHERE external_id='5716520699691008';
UPDATE public.clinic_doctors SET name='Allan Henrique Modrow', color='#C4B5FD', active=true WHERE external_id='6442024534867968';
UPDATE public.clinic_doctors SET name='Davi da Cunha Leal', color='#7DD3FC', active=true WHERE external_id='6744362126475264';
UPDATE public.clinic_doctors SET name='Marianne Cecilia de Oliveira', color='#A5B4FC', active=true WHERE external_id='5346381677854720';
UPDATE public.clinic_doctors SET name='Natasha Elyzabeth Nunes', color='#BEF264', active=true WHERE external_id='4849641424158721';
UPDATE public.clinic_doctors SET active=false WHERE external_id='5189704133640193';

-- Sincroniza doctor_name nas tarefas e nos agendamentos
UPDATE public.clinic_daily_tasks AS t SET doctor_name = d.name 
FROM public.clinic_doctors d WHERE t.doctor_id = d.id;

UPDATE public.clinic_appointments AS a SET doctor_name = d.name 
FROM public.clinic_doctors d WHERE a.doctor_id = d.id;