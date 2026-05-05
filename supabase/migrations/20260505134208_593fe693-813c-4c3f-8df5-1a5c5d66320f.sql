
-- Substituir rotina da Gestão Comercial pelo novo checklist de Abertura/Durante/Fechamento
UPDATE routine_tasks SET active = false
WHERE sector_id = '99f05b51-793e-4c04-b89b-f00add2c1970';

INSERT INTO routine_tasks (title, description, sort_order, sector_id, active) VALUES
('[Abertura] Analisou números, relatórios e indicadores na 1ª hora', 'Primeira hora do dia dedicada a análise antes de qualquer outra ação.', 1, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Abertura] Revisou execuções, tarefas em aberto e bateu o funil', 'Confere o que foi executado, o que ficou pendente e o estado do funil.', 2, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Abertura] Revisou a missão principal de ontem', NULL, 3, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Abertura] Identificou pendências abertas', NULL, 4, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Abertura] Identificou travas e gargalos', NULL, 5, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Abertura] Preparou o dia e definiu suas próprias prioridades', NULL, 6, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Abertura] Delegou as prioridades do time', 'Define missão principal + 2 secundárias para cada pessoa.', 7, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Abertura] Reunião de 10 min com cada membro para planejar e corrigir o dia', 'Registrar no Plano do Dia / Planejamento.', 8, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Abertura] Definiu donos e prazos', NULL, 9, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Abertura] Eliminou o que não entra no dia', NULL, 10, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Abertura] Ajustou a agenda real do time', NULL, 11, '99f05b51-793e-4c04-b89b-f00add2c1970', true),

('[Durante] Protegeu o bloco da missão principal', NULL, 20, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Durante] Evitou interrupções desnecessárias', NULL, 21, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Durante] Acompanhou travas críticas', NULL, 22, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Durante] Delegou o que não precisava ficar na liderança', NULL, 23, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Durante] Manteve resposta controlada, sem espalhar o foco', NULL, 24, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Durante] Registrou desvios relevantes do plano', NULL, 25, '99f05b51-793e-4c04-b89b-f00add2c1970', true),

('[Fechamento] Conferiu o status da missão principal', NULL, 40, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Fechamento] Conferiu o status das duas secundárias', NULL, 41, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Fechamento] Registrou pendências abertas', NULL, 42, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Fechamento] Definiu próximos responsáveis', NULL, 43, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Fechamento] Deixou a missão preliminar de amanhã indicada', NULL, 44, '99f05b51-793e-4c04-b89b-f00add2c1970', true),
('[Fechamento] Encerrou o dia com quadro atualizado', NULL, 45, '99f05b51-793e-4c04-b89b-f00add2c1970', true);
