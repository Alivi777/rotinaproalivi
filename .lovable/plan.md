

# Integração GPT Maker — Sincronizar histórico de conversas

Vou conectar o GPT Maker ao sistema via **webhook** para que toda mensagem trocada com clientes (humano ou IA) seja anexada como nota na ficha do cliente correspondente — sem criar cards novos na Recepção.

## O que será construído

### 1. Edge Function `gptmaker-webhook`
Endpoint público que recebe eventos do GPT Maker:

- **URL para configurar no painel do GPT Maker:**  
  `https://ttgyohcmhapqlnrllfxo.supabase.co/functions/v1/gptmaker-webhook`
- **Método:** `POST` / `application/json`
- **Autenticação:** header `x-api-key` validado contra o secret `GPTMAKER_API_KEY`
- **Sem JWT** (`verify_jwt = false` em `supabase/config.toml`)

### 2. Lógica de sincronização (sem criar card)

Para cada mensagem recebida:

1. Normaliza o telefone (`normalize_phone`) — mesma função já usada pelo WaSeller.
2. Procura **cliente existente** em `clients` pelo telefone.
3. **Se existir:** insere o conteúdo da mensagem como nota em `client_notes` com prefixo `[GPT Maker · {direção} · {hh:mm}]`.
4. **Se não existir:** procura em `contacts`. Se achar, cria card mínimo na Recepção (etapa default) só para ancorar as notas — depois acumula histórico igual ao caso anterior. (Combinamos "sincronizar histórico", então só criamos card se não houver onde anexar; alternativa: descartar — confirme se preferir.)
5. **Deduplicação por mensagem:** usa o ID externo da mensagem do GPT Maker em uma nova coluna `external_id` em `client_notes` para evitar duplicar a mesma mensagem se o webhook repetir.

### 3. Migration de banco

```sql
ALTER TABLE public.client_notes
  ADD COLUMN external_id text,
  ADD COLUMN source text DEFAULT 'manual';

CREATE UNIQUE INDEX client_notes_external_id_source_uniq
  ON public.client_notes (source, external_id)
  WHERE external_id IS NOT NULL;
```

### 4. Visual
Nas notas do card do cliente, mensagens vindas do GPT Maker aparecem com tag `🤖 GPT Maker` para distinguir do que foi digitado manualmente.

## Como você vai obter a API key + URL do GPT Maker

Você disse que tem só a conta. Passos no painel do GPT Maker:

1. Acesse **app.gptmaker.ai** → faça login.
2. Menu lateral → **Configurações** (ou **Settings**) → **API & Integrações**.
3. Copie a **API Key** (geralmente começa com `gpt-` ou similar).
4. Em **Webhooks** (mesma seção ou em **Integrações**), clique **Adicionar webhook**:
   - Cole a URL: `https://ttgyohcmhapqlnrllfxo.supabase.co/functions/v1/gptmaker-webhook`
   - Header: `x-api-key: SUA_CHAVE`
   - Eventos: `message.received`, `message.sent` (toda conversa)
5. Salve.

Se o painel estiver diferente, me manda um print da tela de Configurações que eu te aponto exatamente onde clicar.

## Próximos passos após aprovar

1. Eu peço o secret **`GPTMAKER_API_KEY`** (você cola a chave do passo 3 acima).
2. Crio a migration (`client_notes.external_id` + `source`).
3. Crio a edge function `gptmaker-webhook` + atualizo `supabase/config.toml`.
4. Você cola a URL no painel do GPT Maker e o histórico passa a aparecer automaticamente na ficha de cada cliente.

