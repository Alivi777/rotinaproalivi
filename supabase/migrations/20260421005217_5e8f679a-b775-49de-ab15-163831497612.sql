UPDATE public.clinic_doctors SET name='Allan Henrique Modrow'         WHERE external_id='4553828117577728';
UPDATE public.clinic_doctors SET name='Natasha Elyzabeth Nunes'       WHERE external_id='4849641424158721';
UPDATE public.clinic_doctors SET name='Henrique Ribeiro dos Santos'   WHERE external_id='5189704133640193';
UPDATE public.clinic_doctors SET name='Wanessa Matzenbacher Carneiro' WHERE external_id='5346381677854720';
UPDATE public.clinic_doctors SET name='Agenda Geral'                  WHERE external_id='5716520699691008';
UPDATE public.clinic_doctors SET name='Marianne Cecilia de Oliveira'  WHERE external_id='6442024534867968';
UPDATE public.clinic_doctors SET name='Davi da Cunha Leal'            WHERE external_id='6744362126475264';

UPDATE public.clinic_appointments SET doctor_name='Allan Henrique Modrow'         WHERE doctor_external_id='4553828117577728';
UPDATE public.clinic_appointments SET doctor_name='Natasha Elyzabeth Nunes'       WHERE doctor_external_id='4849641424158721';
UPDATE public.clinic_appointments SET doctor_name='Henrique Ribeiro dos Santos'   WHERE doctor_external_id='5189704133640193';
UPDATE public.clinic_appointments SET doctor_name='Wanessa Matzenbacher Carneiro' WHERE doctor_external_id='5346381677854720';
UPDATE public.clinic_appointments SET doctor_name='Agenda Geral'                  WHERE doctor_external_id='5716520699691008';
UPDATE public.clinic_appointments SET doctor_name='Marianne Cecilia de Oliveira'  WHERE doctor_external_id='6442024534867968';
UPDATE public.clinic_appointments SET doctor_name='Davi da Cunha Leal'            WHERE doctor_external_id='6744362126475264';

UPDATE public.clinic_daily_tasks t SET doctor_name = d.name
FROM public.clinic_doctors d
WHERE t.doctor_id = d.id;