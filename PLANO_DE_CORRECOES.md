# Plano de correções da API

Este documento organiza a revisão em quatro etapas: agendas, serviços, agendamentos e adicionais. As caixas indicam o andamento da implementação; as quatro etapas foram implementadas. Aplicação de migrations e tratamento dos dados existentes no Supabase permanecem pendentes e separados da implementação.

## Diretrizes

- Preservar autenticação e filtros por proprietário em todas as operações.
- Manter `enableRLS()`: as políticas são gerenciadas no Supabase e não constituem um problema a corrigir neste plano.
- Aplicar todas as simplificações da revisão: regras compartilhadas, schemas reutilizáveis, tratamento central de erros, logs consistentes, respostas padronizadas e paginação.
- Manter os métodos de edição atuais nesta rodada; uma eventual migração de `PUT` para `PATCH` fica fora do escopo.
- Não executar migrations, modificar dados ou implementar funcionalidades durante a definição do plano.
- A construção da suíte E2E e a configuração de coverage serão uma fase posterior. Os critérios abaixo orientarão essa suíte; não são tarefas de criação de testes agora.
- Na implementação futura, verificar tipos e contratos por etapa. Planejar alterações no cliente quando houver mudanças de formato, sem incluir implementação do frontend neste documento.

## Etapa 1 — Agendas

### 1.1. Corrigir listagem e consulta individual

- [x] Registrar `GET /schedules` para listar e `GET /schedules/:scheduleId` para consultar uma agenda.
  - [x] Exigir UUID na consulta individual e remover a ramificação de listagem do handler com ID.
  - [x] Preservar `404` para ID inexistente ou pertencente a outra conta.
  - [x] Ordenar a listagem por dia da semana para representar o expediente.

### 1.2. Unificar o contrato de horários

- [x] Aceitar `HH:mm` na criação e na edição, sem data, segundos ou offset.
  - [x] Compartilhar o schema de horário e a conversão para minutos.
  - [x] Validar `endTime > startTime` sobre os valores finais, inclusive em edição parcial.
  - [x] Manter a regra atual de um expediente por usuário e dia, sem intervalos que cruzam a meia-noite.
  - [x] Normalizar a representação da resposta para `HH:mm`, pois o banco pode retornar segundos.
  - [x] Preparar migration com `CHECK (end_time > start_time)` e consulta de inventário dos registros incompatíveis.
  - [ ] Antes de aplicar a migration no Supabase, executar o inventário e resolver registros incompatíveis. Não ajustar registros silenciosamente.

### 1.3. Definir o efeito das mudanças de expediente

- [x] Aplicar a proposta de proteger reservas futuras ativas (`scheduled` e `confirmed`).
  - [x] Bloquear com `409` alterações de horário/dia que deixem essas reservas fora do expediente e exclusões de dias com essas reservas.
  - [x] Preservar registros históricos e cancelados, sem mover ou cancelar reservas automaticamente.
  - [x] Coordenar a verificação com criação e reagendamento: usar uma transação com bloqueio da linha do usuário, compartilhado pelos fluxos que alteram disponibilidade.
  - [x] Usar o mesmo fuso e a mesma regra de enquadramento definidos na etapa de agendamentos.

### Critérios de conclusão

- Listagem acessível; consulta individual isolada por conta.
- Criação e edição usam o mesmo formato; expedientes invertidos são rejeitados.
- Alterações concorrentes de expediente e reservas não aprovam estados incompatíveis.

### Registro da implementação

- Listagem retorna um array ordenado por `weekDay`; consulta individual e edição preservam o formato atual do objeto. A padronização de envelopes permanece na etapa 4.
- Criação e edição recebem `HH:mm`; todas as respostas de agenda normalizam os horários para esse formato.
- Mudanças de expediente e criação/edição de agendamentos compartilham bloqueio transacional da linha do usuário, com isolamento `READ COMMITTED`.
- Reservas futuras protegidas são aquelas com `startAt > agora` e status `scheduled` ou `confirmed`. Histórico e demais estados não impedem mudanças e não são modificados.
- Fuso configurável por `SCHEDULING_TIME_ZONE`, com padrão `America/Sao_Paulo`. O mesmo cálculo de dia/horário e enquadramento é usado pelas agendas e pelos dois fluxos de reserva integrados nesta etapa.
- As alterações em criação/edição de agendamentos se limitam às dependências desta etapa: transação, bloqueio e disponibilidade compartilhada. As demais tarefas da etapa 3 continuam pendentes.
- Migration preparada: `src/db/migrations/0002_schedule-time-order.sql`, acompanhada do snapshot e journal do Drizzle. **Não foi aplicada no Supabase.** RLS preservado.
- Validação: TypeScript e Biome passaram. Verificações temporárias em memória cobriram formato, respostas, isolamento entre contas, proteção de reservas, limites de horário e concorrência com criação/reagendamento, em processos UTC e Asia/Tokyo. Não houve criação da suíte E2E ou configuração de coverage, nem teste contra o banco real.

Consulta de inventário a executar antes da migration (somente leitura):

```sql
SELECT id, user_id, week_day, start_time, end_time
FROM schedules
WHERE end_time <= start_time
   OR EXTRACT(SECOND FROM start_time) <> 0
   OR EXTRACT(SECOND FROM end_time) <> 0;
```

Expedientes invertidos impedem a nova constraint; horários com segundos precisam ser revisados para corresponder ao contrato `HH:mm`. A consulta foi documentada, mas não executada nesta implementação.

## Etapa 2 — Serviços

### 2.1. Corrigir listagem e consulta individual

- [x] Separar `GET /services` de `GET /services/:serviceId`.
  - [x] Exigir UUID no endpoint individual e preservar isolamento e `404`.
  - [x] Preparar a listagem para o contrato de paginação da etapa 4.

### 2.2. Tratar exclusão de serviços vinculados

- [x] Manter a FK e impedir a exclusão de serviço referenciado por qualquer agendamento.
  - [x] Traduzir a violação da FK correspondente para `409`, com mensagem explicando que existem agendamentos vinculados.
  - [x] Tratar a violação no banco mesmo se houver consulta prévia, cobrindo vínculo criado simultaneamente.
  - [x] Preservar `204` para exclusão válida e `404` para recurso inexistente ou de outra conta.
  - [x] Não adicionar desativação/arquivamento nesta rodada; essa funcionalidade exigiria novos contratos.

### 2.3. Consolidar validações e preservar reservas existentes

- [x] Compartilhar os schemas de nome, descrição, duração e preço entre criação e edição.
  - [x] Manter as restrições atuais de duração e preço, distinguindo omissão de `null` em campos anuláveis.
  - [x] Reutilizar a validação de corpo de edição vazio.
  - [x] Definir que editar a duração do serviço afeta novas reservas e alterações explícitas de serviço; não modifica reservas existentes automaticamente.
  - [x] Coordenar essa regra com a correção de edição parcial da etapa 3.

### Critérios de conclusão

- Listagem acessível e validação consistente entre criação e edição.
- Exclusão com vínculos retorna conflito de negócio, sem apagar histórico.
- Alterar um serviço não altera os horários de reservas já registradas.

### Registro da implementação

- `GET /services` lista apenas os serviços da conta, ordenados por `createdAt DESC, id DESC`; `GET /services/:serviceId` exige UUID v7 e mantém `404` para recurso inexistente ou de outra conta.
- A listagem continua retornando um array. A ordenação estável prepara a paginação; parâmetros e envelope paginados permanecem na etapa 4.
- Exclusão continua executada diretamente no banco, sem consulta prévia sujeita a corrida. A violação `23503` da constraint `appointments_service_id_services_id_fk` retorna `409`; outras falhas não são classificadas como esse conflito.
- Serviços vinculados a qualquer status de agendamento não podem ser excluídos. FK e registros históricos foram preservados; nenhuma migration foi necessária.
- Criação e edição compartilham schemas de nome, descrição, duração e preço, além do schema de ID usado nas consultas e exclusão. Edição vazia é rejeitada por um validador reutilizável; omissão preserva campos e `null` limpa somente campos anuláveis.
- A dependência com edição de agendamentos foi integrada: reserva existente preserva a duração registrada ao editar dados cadastrais, reenviar o mesmo serviço ou mudar somente o início. A seleção efetiva de outro serviço usa a duração atual desse serviço; novas reservas usam a duração atual do serviço selecionado.
- Essa integração não removeu a revalidação de disponibilidade em edições cadastrais: separar esse fluxo e as demais regras de agendamentos continua sendo tarefa da etapa 3.
- Validação: TypeScript e Biome passaram; 102 verificações temporárias em memória cobriram consultas, isolamento, validação, omissão/`null`, preservação de duração, novos serviços/reservas, exclusão com vínculos de todos os status e simulação de vínculo criado no momento da exclusão. A FK foi simulada, sem teste contra o banco real.
- Nenhum acesso ou alteração no Supabase; E2E e coverage continuam para a fase posterior.

## Etapa 3 — Agendamentos

### 3.1. Tornar o cálculo de disponibilidade independente do servidor

- [x] Adotar um fuso IANA configurado pela API, com proposta inicial `America/Sao_Paulo`.
  - [x] Continuar recebendo início ISO com offset e armazenando instantes em `timestamptz`.
  - [x] Calcular dia da semana, horário local e mudança de dia explicitamente nesse fuso, sem depender de `TZ` ou dos getters locais de `Date`.
  - [x] Compartilhar a regra entre criação, reagendamento e verificação de alterações de expediente.
  - [x] Rejeitar início com segundos ou milissegundos diferentes de zero para manter a precisão de minutos.
  - [x] Permitir término exatamente no fechamento e reservas adjacentes, sem permitir término posterior ou passagem para o dia seguinte.
  - [x] Tratar suporte a fusos diferentes por estabelecimento como evolução posterior, salvo revisão da proposta inicial.

### 3.2. Garantir exclusividade dos intervalos no banco

- [x] Impedir sobreposições do mesmo usuário em criação e reagendamento.
  - [x] Manter a consulta antecipada para mensagem amigável, mas não depender dela como garantia.
  - [x] Planejar restrição de exclusão sobre `user_id` e `tstzrange(start_at, end_at, '[)')`, ignorando apenas registros `cancelled`, preservando a regra atual.
  - [x] Confirmar disponibilidade de `btree_gist` pela documentação do Supabase e preparar a ativação na migration.
  - [ ] Antes de aplicar a migration, conferir disponibilidade e schema da extensão no projeto Supabase de destino.
  - [x] Preparar consultas de inventário de intervalos inválidos e sobreposições existentes.
  - [ ] Antes de aplicar a restrição, executar o inventário e resolver cada caso, sem excluir reservas automaticamente.
  - [x] Traduzir violação da restrição identificada para `409`.
  - [x] Planejar também `CHECK (end_at > start_at)`.
  - [x] Usar o bloqueio por usuário descrito na etapa 1 para coordenar reservas com mudanças de expediente; a restrição de exclusão continua sendo a garantia de não sobreposição.

### 3.3. Separar edição cadastral de reagendamento

- [x] Compartilhar a validação de disponibilidade entre criação e mudanças efetivas de serviço ou início.
  - [x] Ao editar somente nome, telefone ou observações, preservar `startAt`, `endAt` e `serviceId`, sem consultar expediente nem conflitos.
  - [x] Preservar a duração registrada ao mudar somente o início; ao trocar efetivamente o serviço, calcular a duração usando o novo serviço.
  - [x] Não recalcular duração quando o cliente reenviar o mesmo `serviceId`.
  - [x] Validar o instante final de início contra o passado em reagendamentos, inclusive quando apenas o serviço mudar.
  - [x] Reutilizar schemas de cliente, telefone, observações, IDs e corpo de edição vazio.
  - [x] Coordenar leitura e gravação para evitar sobrescritas por edições concorrentes, bloqueando a reserva dentro da transação.

### 3.4. Proteger transições de status e histórico

- [x] Tornar a mudança de status atômica.
  - [x] Condicionar o `UPDATE` ao ID, proprietário e status anterior, mantendo a tabela de transições.
  - [x] Retornar `409` quando houver disputa de atualização e `404` quando o recurso não existir para a conta.
- [x] Aplicar as propostas de regras temporais e estados finais.
  - [x] Permitir `completed` somente quando `endAt <= agora` e `no_show` somente quando `startAt <= agora`.
  - [x] Impedir alterações de serviço/início para `completed`, `cancelled` e `no_show`; permitir correções de dados cadastrais sem mudar intervalo/status.
  - [x] Manter as transições terminais atuais, sem adicionar reabertura.
  - [x] Manter a exclusão explícita já existente nesta rodada; retenção obrigatória e trilha de auditoria exigem decisão própria.

### 3.5. Preparar a consulta para crescimento do histórico

- [x] Adicionar paginação e filtros opcionais de período na listagem.
  - [x] Filtrar `startAt` por limite inicial inclusivo e final exclusivo, usando instantes ISO com offset.
  - [x] Usar ordenação estável por `startAt DESC, id DESC`.
  - [x] Selecionar explicitamente os campos retornados da reserva e do serviço.
  - [x] Revisar a consulta e seus índices para filtro por usuário, período e ordenação.

### Critérios de conclusão

- Reservas simultâneas sobrepostas não são ambas aprovadas; reservas adjacentes são permitidas.
- O resultado independe do fuso do servidor e respeita os limites de expediente.
- Editar observações não altera duração nem dispara validação de disponibilidade.
- Transições concorrentes não sobrescrevem estados terminais.
- Histórico consultável por período e em páginas estáveis.

### Registro da implementação

- Schemas compartilhados validam IDs, cliente, telefone, observações e edição vazia. Inícios recebidos devem ter segundos e frações iguais a zero; offsets ISO continuam aceitos e os instantes permanecem em `timestamptz`.
- Disponibilidade centralizada para criação/reagendamento: início futuro verificado após os bloqueios, intervalo positivo, mesmo dia no fuso configurado, expediente e conflitos. Término no fechamento e intervalos adjacentes são permitidos.
- Criação e edição mantêm o bloqueio por usuário da etapa 1. A edição também bloqueia a reserva antes de ler seus dados, coordenando-se com alterações de status e exclusão.
- Edições sem mudança efetiva de serviço/início atualizam apenas os campos cadastrais informados, inclusive em registros históricos ou finais; não consultam serviço, agenda ou conflitos. Omissão preserva valores e `notes: null` limpa a observação.
- Reagendamento permitido somente em `scheduled`/`confirmed`. Duração registrada preservada ao mudar somente início ou reenviar o mesmo serviço; seleção de outro serviço usa a duração atual desse serviço.
- Mudanças de status usam transação com bloqueio da reserva e comparação com a versão observada (status e intervalo). O `UPDATE` exige ID, proprietário e status anterior; alterações concorrentes retornam `409`, registro inexistente retorna `404` e transições inválidas retornam `422`.
- `completed` exige término já alcançado e `no_show` exige início já alcançado. Estados finais não podem ser reabertos ou reagendados, mas aceitam correções cadastrais. Exclusão explícita permanece disponível.
- `GET /appointments` aceita `page` (padrão 1), `pageSize` (padrão 20, máximo 100), `from` e `to` opcionais em ISO com offset. O intervalo filtra `startAt` com início inclusivo e fim exclusivo; quando ambos são informados, `from < to`.
- A resposta de listagem mudou de array para `{ appointments, pagination: { page, pageSize, hasNext } }`. Ordenação `startAt DESC, id DESC`; consulta busca um registro adicional, sem contagem total. Paginação por offset é estável nos empates, mas não oferece snapshot entre requisições quando o histórico muda.
- Campos da reserva são selecionados explicitamente. O serviço relacionado retorna somente `id`, `name`, `description`, `durationInMinutes` e `price`, com seus valores atuais.
- Preparado índice composto por usuário/início/ID e `CHECK (end_at > start_at)` no schema Drizzle. Snapshot e journal foram atualizados. A restrição de exclusão fica em SQL customizado, pois essa versão do Drizzle não a representa no schema declarativo.
- Migration `src/db/migrations/0003_appointment-integrity.sql` preparada com `btree_gist` e exclusão de intervalos `[)` por usuário, ignorando somente `cancelled`. Violações `23P01` dessa constraint específica retornam `409` em criação/edição. **Migration não aplicada no Supabase.** A garantia do banco para escritores externos depende dessa aplicação.
- [Disponibilidade de extensões no Supabase](https://supabase.com/docs/guides/database/extensions) e [restrições de exclusão no PostgreSQL](https://www.postgresql.org/docs/18/sql-createtable.html) conferidas. O schema `extensions`, usado pelo Supabase, está contemplado no search path local da migration; RLS permanece intacto.
- Validação: TypeScript e Biome passaram; snapshot consistente com o schema (geração posterior sem diferenças). Verificações temporárias em memória cobriram precisão, fuso, adjacência, conflito, edição cadastral sem disponibilidade, estados finais, limites temporais, disputas de atualização, isolamento entre contas, paginação/filtros e tradução da constraint. Passaram 155 verificações por execução em UTC e Asia/Tokyo, além das regressões das etapas 1 e 2 (108 e 102 verificações). Transações e constraints foram simuladas, sem conexão com PostgreSQL real, E2E persistido ou coverage.

Consultas de inventário a executar no Supabase antes de aplicar a migration (somente leitura):

```sql
-- Disponibilidade e instalação da extensão no projeto de destino.
SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name = 'btree_gist';

SELECT e.extname, n.nspname AS extension_schema
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname = 'btree_gist';

-- Intervalos incompatíveis com o CHECK, inclusive cancelados.
SELECT id, user_id, start_at, end_at, status
FROM appointments
WHERE end_at <= start_at;

-- Pares sobrepostos incompatíveis com a exclusão.
-- Usa comparações, sem construir ranges sobre intervalos inválidos.
SELECT a.user_id, a.id AS appointment_id, b.id AS conflicting_appointment_id
FROM appointments a
JOIN appointments b ON b.user_id = a.user_id AND a.id < b.id
WHERE a.status <> 'cancelled'
  AND b.status <> 'cancelled'
  AND a.end_at > a.start_at
  AND b.end_at > b.start_at
  AND a.start_at < b.end_at
  AND a.end_at > b.start_at;
```

Essas consultas foram documentadas, mas não executadas. Registros incompatíveis devem ser resolvidos antes da aplicação, sem exclusão ou ajuste automático. A avaliação de desempenho com plano de execução e dados reais também permanece para a validação do deploy.

## Etapa 4 — Adicionais e consistência da API

### 4.1. Corrigir a identidade textual do CNPJ

- [x] Integrar validação e normalização ao mesmo schema Zod usado pelo Better Auth.
  - [x] Persistir somente os dígitos e aplicar o mesmo processamento em cadastro e atualização de usuário.
  - [x] Preparar inventário de formatos existentes e colisões após normalização antes de qualquer atualização de dados.
  - [ ] Executar o inventário no Supabase antes de modificar dados ou aplicar a migration de unicidade normalizada.
  - [x] Preparar normalização transacional que bloqueia a execução quando existem colisões ou CNPJs inválidos.
  - [ ] Resolver colisões explicitamente no Supabase, sem unir ou excluir contas automaticamente; depois executar a normalização preservando a unicidade.
  - [x] Garantir que duplicidade seja tratada como erro de entrada/conflito, sem expor detalhes do banco.
  - [x] Não adicionar comprovação de propriedade do CNPJ nesta rodada; registrar essa necessidade se ele passar a representar identidade empresarial verificada.

### 4.2. Centralizar erros e padronizar logs

- [x] Criar tratamento compartilhado de erros esperados e inesperados.
  - [x] Preservar o corpo de erro `{ message }` e usar `401`, `404`, `409`, `422` e `500` conforme a condição.
  - [x] Mapear erros PostgreSQL pelo código e pela constraint conhecida, evitando traduzir qualquer FK/duplicidade como o mesmo conflito.
  - [x] Substituir blocos repetidos de captura nas rotas por erros de domínio e tratamento central, preservando o comportamento específico de autenticação.
- [x] Padronizar logs por operação, ID do recurso, proprietário e resultado.
  - [x] Remover objetos completos de reservas, nome, telefone e observações dos logs.
  - [x] Não registrar cookies, tokens, senhas, credenciais, parâmetros SQL ou erros brutos que contenham esses dados.
  - [x] Registrar falhas inesperadas de forma sanitizada; em transições, registrar status anterior e novo após confirmação da atualização.

### 4.3. Unificar respostas, schemas e documentação

- [x] Padronizar sucesso com `{ schedule }`, `{ service }` ou `{ appointment }` em criação, consulta individual, edição e mudança de status.
  - [x] Manter `201` em criação, `200` em consultas/edições e `204` sem corpo em exclusão.
  - [x] Usar `{ schedules }` na lista de agendas, limitada a sete registros por conta.
  - [x] Usar `{ services, pagination }` e `{ appointments, pagination }` nas listas paginadas.
  - [x] Definir `page` e `pageSize` como inteiros positivos, defaults `1` e `20`, com máximo `100` para `pageSize`; `pagination` contém `page`, `pageSize` e `hasNext`.
  - [x] Buscar um registro adicional para calcular `hasNext`, sem exigir contagem total.
  - [x] Ordenar serviços por `createdAt DESC, id DESC` para estabilidade.
- [x] Organizar schemas e utilitários compartilhados por domínio, sem criar abstrações genéricas de CRUD que escondam as regras.
  - [x] Extrair as peças reutilizáveis durante as etapas 1–3 e consolidar nesta etapa.
  - [x] Atualizar OpenAPI com formatos, envelopes, paginação, filtros e respostas de erro finais.
  - [x] Documentar mudanças incompatíveis: horário do POST de agendas, envelopes de sucesso e retorno paginado.

### 4.4. Preservar proteções e registrar a decisão sobre rate limiting

- [x] Preservar CORS restrito ao frontend e as proteções de sessão existentes.
- [x] Registrar que RLS e suas políticas permanecem sob gestão do Supabase, sem migration para substituir ou remover essas políticas.
- Rate limiting **não configurado por solicitação explícita do usuário**, pois não haverá deploy por enquanto. A tarefa de configuração para produção foi retirada desta rodada; armazenamento compartilhado, proxy e limites deverão ser definidos quando houver deploy. Padrões da biblioteca preservados.

### Critérios de conclusão

- CNPJ formatado e sem máscara representam a mesma identidade persistida.
- Respostas e erros seguem contratos uniformes; documentação acompanha esses contratos.
- Logs não contêm dados pessoais de clientes ou segredos.
- Paginação tem limites explícitos; sessão e CORS permanecem protegidos. Rate limiting fica adiado conforme decisão do usuário.

### Registro da implementação

- CNPJ validado e normalizado pelo schema compartilhado do Better Auth e por hooks de cadastro/atualização. Consulta de duplicidade reconhece formatos antigos com máscara e permite atualizar o próprio CNPJ sem conflitar com a mesma conta.
- Script `scripts/normalize-cnpjs.ts` preparado: inventário somente leitura por padrão; `--apply` exige ausência de registros inválidos/colisões e usa transação com bloqueio de escrita. Relatórios contêm contagens e IDs, sem valores pessoais. **Nenhum modo foi executado contra o Supabase.**
- Migration `0004_cnpj-normalized-identity.sql`, snapshot e journal preparados para índice único sobre CNPJ normalizado. Geração offline posterior confirmou ausência de diferenças entre schema e snapshot. **Não aplicada.** Registros incompatíveis precisam de inventário e resolução explícita antes da aplicação.
- Erros de domínio e middleware global substituem capturas repetidas nas rotas; tradução PostgreSQL exige código e constraint conhecidos. Falhas inesperadas, JSON malformado e rotas desconhecidas recebem respostas sanitizadas. Autenticação preserva respostas esperadas da biblioteca e sanitiza falhas inesperadas.
- Logs de sucesso são emitidos depois da gravação/confirmação da transação, com operação, proprietário e ID; transições incluem estados anterior/novo. Logs de falha e do Better Auth descartam mensagens brutas, SQL, parâmetros e dados pessoais/segredos.
- Sucessos individuais usam `{ schedule }`, `{ service }` e `{ appointment }`; exclusão mantém `204` sem corpo. Agendas usam `{ schedules }`, com limite de sete; serviços e agendamentos compartilham schemas/helpers de paginação e envelopes com `pagination`.
- Serviços recebem paginação com padrões página 1/tamanho 20, máximo 100 e ordenação `createdAt DESC, id DESC`. Ambas as listas consultam um registro adicional; offsets inseguros são rejeitados.
- Schemas por domínio e utilitários compartilhados consolidados; validação de edição vazia de agenda passou para o schema. Regras de disponibilidade e concorrência das etapas anteriores preservadas.
- OpenAPI 3.0.3 documenta schemas, envelopes, erros, horários, filtros, paginação e autenticação por cookie. Inicialização da aplicação separada do servidor para permitir verificação dos handlers sem abrir porta. Montagem da autenticação limitada a `/api/auth`, preservando o tratamento de rotas inexistentes da API.
- Contratos finais e alterações incompatíveis descritos em [CONTRATOS_DA_API.md](CONTRATOS_DA_API.md), incluindo limites da paginação, semântica de edição, migrations e procedimentos futuros de inventário/normalização.
- Rate limiting não configurado, conforme solicitação do usuário; CORS, sessões e RLS preservados.
- Validação: TypeScript e Biome passaram; 450 verificações temporárias em memória passaram (87 da etapa 4 e regressões das etapas 1–3 com 106, 102 e 155). Cobriram normalização/duplicidade de CNPJ, hooks reais do Better Auth com banco simulado, erros centralizados, envelopes, paginação, logs sem dados sensíveis, falha no commit e documentação OpenAPI. Regressões das três etapas anteriores também passaram. Não houve criação de suíte E2E persistida, coverage ou acesso ao PostgreSQL/Supabase real.

## Decisões propostas e dependências

- A proteção de reservas futuras foi adotada na etapa 1. Precisão de minutos, restrições temporais de status e regras de estados finais foram adotadas na execução da etapa 3.
- A etapa 1 adotou `America/Sao_Paulo` como padrão configurável da API. Suporte a fusos distintos por estabelecimento permanece uma evolução posterior.
- Preservar nome/preço históricos por snapshot não entra nesta rodada: a resposta continuará exibindo dados atuais do serviço. Essa mudança requer definição de histórico comercial e tratamento dos registros existentes.
- A etapa 1 depende das regras compartilhadas de disponibilidade e coordenação com reservas detalhadas na etapa 3. Esses componentes podem ser extraídos antecipadamente, sem duplicar implementações.
- Mudanças de banco exigem inspeção futura dos dados existentes e preparação das migrations; este documento não autoriza sua aplicação no Supabase.
- As quatro etapas foram implementadas. Permanecem as tarefas de inventário/resolução de dados e aplicação autorizada das migrations no Supabase. Na próxima fase, construir a suíte E2E com coverage usando os critérios de conclusão, incluindo autenticação, isolamento entre contas, concorrência e limites de horário.
