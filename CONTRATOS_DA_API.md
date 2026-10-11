# Contratos da API após as correções

A documentação interativa está em `/docs`, com OpenAPI 3.0.3 em `/docs/json`. As rotas administrativas exigem sessão do Better Auth e filtram os recursos pelo proprietário. O cliente administrativo deve enviar os cookies de sessão; CORS permanece restrito a `FRONTEND_URL`, com credenciais habilitadas. As rotas `/public/companies/:companyId` e suas subrotas dispensam autenticação.

## Respostas de sucesso

| Operação | Status | Corpo |
| --- | --- | --- |
| Criar agenda ou serviço (autenticado) | 201 | `{ schedule }` ou `{ service }` |
| Criar agendamento público | 201 | `{ appointment: { id, serviceId, startAt, endAt, status } }` |
| Consultar agenda/serviço individualmente ou editar um recurso | 200 | O mesmo envelope do recurso |
| Alterar status de agendamento | 200 | `{ appointment }` |
| Listar agendas | 200 | `{ schedules }`, ordenado por dia, no máximo sete registros |
| Listar serviços | 200 | `{ services, pagination }` |
| Listar agendamentos | 200 | `{ appointments, pagination }` |
| Excluir | 204 | Sem corpo |

Listagem e consulta individual de agendas/serviços têm rotas distintas: `/schedules` e `/schedules/:scheduleId`, `/services` e `/services/:serviceId`. Agendamentos são consultados pela listagem `/appointments`; não há GET individual nesta rodada. Edição e exclusão usam `/appointments/:appointmentId`. IDs recebidos nessas rotas são UUID v7. As edições mantêm `PUT`; a mudança de status usa `PATCH`.

## Agendamento público pelo cliente

`GET /booking-link` exige sessão e retorna `{ "url": "${FRONTEND_URL}/agendar/{companyId}" }`. O ID vem da empresa autenticada; o link é fixo. É preciso ter ao menos um serviço e um dia de atendimento cadastrados, caso contrário a resposta é `422`. Isso não garante vaga em uma data específica.

`GET /public/companies/:companyId` retorna:

```json
{
  "company": {
    "name": "Empresa",
    "timeZone": "America/Sao_Paulo",
    "schedules": [{ "weekDay": 1, "startTime": "09:00", "endTime": "18:00" }],
    "services": [{ "id": "<UUID v7>", "name": "Corte", "description": null, "durationInMinutes": 30, "price": 25 }]
  }
}
```

Essa consulta lista todos os serviços, sem paginação, e os horários semanais em ordem de dia. Não retorna CNPJ, e-mail da empresa, dados de clientes ou reservas.

`GET /public/companies/:companyId/availability?serviceId=<UUID v7>&date=2030-01-07` retorna `{ "slots": [{ "startAt": "2030-01-07T12:00:00.000Z", "endAt": "2030-01-07T12:30:00.000Z" }] }`. A data `YYYY-MM-DD` corresponde ao fuso `SCHEDULING_TIME_ZONE`, divulgado como `timeZone`; os instantes da resposta são ISO 8601 em UTC. Os inícios avançam a cada 15 minutos desde a abertura (por exemplo, `09:07`, `09:22`, `09:37`), com duração integral do serviço e término até o fechamento. Horários passados, dias fechados e dias lotados retornam lista vazia. Reservas de qualquer serviço da empresa ocupam o intervalo, exceto as canceladas. A resposta contém somente intervalos livres.

`POST /public/companies/:companyId/appointments` recebe:

```json
{
  "serviceId": "<UUID v7>",
  "startAt": "2030-01-07T09:00:00-03:00",
  "customerName": "Maria",
  "customerEmail": "maria@example.com",
  "customerPhone": "11987654321",
  "notes": "Observação opcional"
}
```

Nome, e-mail válido e telefone são obrigatórios. Nome e telefone mantêm a validação e normalização existentes. `notes` é opcional e aceita `null`. O proprietário é determinado exclusivamente pela URL, mesmo se houver sessão de outra empresa. O serviço deve pertencer à empresa indicada. A reserva nasce como `scheduled`, sem conta de cliente, envio de e-mail ou confirmação da identidade dos contatos. A resposta `201` contém apenas `id`, `serviceId`, `startAt`, `endAt` e `status` dentro de `appointment`.

Dados inválidos, horário passado, fora do expediente ou desalinhado à grade retornam `422`; empresa/serviço inexistente ou serviço de outra empresa retorna `404`. A disponibilidade é consultiva: a criação adquire o bloqueio da empresa e verifica novamente o horário dentro da transação. Um intervalo ocupado nesse momento retorna `409`; o frontend deve atualizar os horários. Mudanças de expediente ou duração também são revalidadas na criação.

**`POST /appointments` foi removido e retorna `404`.** Consulta, edição, exclusão e mudança de status administrativas continuam autenticadas e restritas à empresa proprietária. A edição administrativa permite qualquer minuto, sem exigir a grade pública de 15 minutos. Não há cancelamento público.

## Paginação e filtros

Serviços e agendamentos aceitam `page` e `pageSize`, inteiros positivos com padrões `1` e `20`. `pageSize` tem máximo `100`; offsets que excedam a precisão segura de inteiros são rejeitados. O envelope `pagination` contém `page`, `pageSize` e `hasNext`. Um registro adicional determina `hasNext`, sem contagem total.

Serviços usam `createdAt DESC, id DESC`; agendamentos usam `startAt DESC, id DESC`. A ordenação resolve empates, mas a paginação por offset não oferece snapshot entre requisições quando os registros mudam.

Agendamentos aceitam `from` inclusivo e `to` exclusivo sobre `startAt`, em ISO com offset. Quando ambos são enviados, `from < to`. Em query strings, codifique o sinal `+` dos offsets como `%2B`.

## Horários e edição parcial

Agendas recebem e retornam `HH:mm`. `weekDay` vai de `0` (domingo) a `6` (sábado). O término deve ser posterior ao início, no mesmo dia. Alterações ou exclusões de expediente não podem deixar reservas futuras `scheduled` ou `confirmed` fora dele.

Agendamentos recebem início ISO com offset, com segundos e frações iguais a zero. O expediente é interpretado em `SCHEDULING_TIME_ZONE`, cujo padrão é `America/Sao_Paulo`, independentemente do fuso do servidor. Reservas adjacentes e término exatamente no fechamento são permitidos.

Campos omitidos em edição preservam seus valores. `null` limpa somente campos anuláveis, como descrição/preço do serviço e observações da reserva. Edição sem campos definidos retorna `422`.

Correções cadastrais da reserva preservam intervalo, serviço e status, sem revalidar disponibilidade. Reenviar o mesmo serviço/início não representa reagendamento. Mudar somente o início preserva a duração registrada; selecionar outro serviço usa a duração atual desse serviço. Alterar a duração de um serviço não modifica reservas existentes.

Estados `completed`, `cancelled` e `no_show` permitem correções cadastrais, mas não reagendamento nem reabertura. `completed` exige término já alcançado; `no_show` exige início já alcançado. Disputas entre alterações de status/intervalo retornam `409`.

Na listagem de agendamentos, o serviço relacionado contém apenas `id`, `name`, `description`, `durationInMinutes` e `price`, com seus valores atuais. Snapshots comerciais históricos permanecem uma evolução posterior.

Listagem e respostas administrativas incluem `customerEmail`, que pode ser `null` em reservas antigas. A edição aceita um e-mail válido quando informado; omiti-lo preserva o valor anterior, inclusive `null`. Telefones existentes não são alterados pela migration nem por edições de outros campos.

## Erros, autenticação e logs

As rotas de negócio retornam `{ message }`:

| Status | Condição |
| --- | --- |
| 401 | Sessão ausente ou inválida |
| 404 | Recurso inexistente ou pertencente a outra conta; rota inexistente |
| 409 | Conflito de unicidade, vínculo, disponibilidade ou atualização concorrente |
| 422 | Dados inválidos, JSON malformado ou regra de negócio inválida |
| 500 | Falha inesperada, com mensagem genérica |

Erros PostgreSQL são traduzidos somente quando código e constraint correspondem a uma regra conhecida. Falhas inesperadas não expõem SQL, parâmetros, credenciais ou mensagens internas.

`/api/auth` preserva respostas, cookies e códigos de erro esperados do Better Auth. Falhas inesperadas recebem tratamento sanitizado. CNPJ é validado e normalizado para dígitos no cadastro e na atualização; comparações também reconhecem registros antigos com máscara. Duplicidades retornam erro de entrada/conflito; o Better Auth pode traduzir uma corrida no cadastro em erro de criação `422`. CNPJ cadastrado não representa comprovação de propriedade empresarial.

**Rate limiting não foi configurado, por solicitação do usuário, pois não haverá deploy por enquanto.** Os padrões da biblioteca permanecem inalterados. Configuração de produção, armazenamento compartilhado e confiança em proxy ficam para uma decisão futura.

Logs de alterações usam operação, ID do recurso, proprietário e resultado. Transições incluem estado anterior e novo somente depois da confirmação da transação. Logs de falhas usam metadados sanitizados, sem nomes, e-mails, telefones, observações, CNPJs, cookies, tokens, senhas ou erros brutos.

## Banco e dados existentes

A migration `0005_appointment-customer-email.sql` adiciona somente a coluna nullable `customer_email`, sem preencher e-mails nem modificar telefones existentes. Foi gerada com snapshot e registro no journal, mas **não foi aplicada no banco**. Aplique as migrations pendentes com `bun run db:migrate` antes de iniciar o backend atualizado; preserve os cuidados com dados preexistentes descritos abaixo.

As migrations `0002_schedule-time-order.sql`, `0003_appointment-integrity.sql` e `0004_cnpj-normalized-identity.sql` estão preparadas e **não foram aplicadas no Supabase**. Os inventários de expedientes e reservas estão no [plano de correções](PLANO_DE_CORRECOES.md). A garantia de exclusividade de intervalos no banco depende da aplicação da migration correspondente. `enableRLS()` e as políticas gerenciadas no Supabase foram preservados.

O script de CNPJ foi preparado, mas não executado no banco. Para inventário, o comando abaixo apenas lê dados e informa contagens, IDs inválidos e grupos de contas com colisão; não mostra CNPJs nem credenciais:

```sh
bun run scripts/normalize-cnpjs.ts
```

Resolver CNPJs inválidos e colisões exige decisão explícita sobre cada conta, sem união ou exclusão automática. Somente depois desse inventário e com autorização para modificar dados, a normalização pode ser executada:

```sh
bun run scripts/normalize-cnpjs.ts --apply
```

Esse modo usa transação e bloqueio de escrita da tabela; qualquer registro inválido ou colisão impede toda a normalização. A migration `0004` adiciona unicidade sobre a representação normalizada, incluindo registros antigos com máscara; colisões existentes precisam ser resolvidas antes de aplicá-la.

## Adaptação do cliente e validação

Coordene a publicação do frontend e do backend: o frontend deve criar a página `/agendar/{companyId}`, usar as consultas públicas, exigir os três contatos e criar reservas pela nova rota pública. O POST administrativo antigo não está mais disponível. Este trabalho cobre somente o backend; não cria a página, contas de clientes, envio de e-mails ou cancelamento público.

O cliente também precisa ajustar o POST de agendas para `HH:mm`, ler os envelopes em todas as respostas de recursos, ler `{ schedules }` na listagem de agendas e tratar paginação de serviços/agendamentos. Listagens paginadas retornam vinte registros por padrão.

A suíte persistida em `tests/` cobre contratos HTTP, disponibilidade, validação e isolamento com banco e autenticação simulados, sem acesso ao Supabase. Consulte [os limites e defeitos conhecidos da suíte](tests/README.md). Aplicação de migrations, constraints e concorrência no PostgreSQL real, autenticação por navegador e desempenho com dados reais não foram verificados.
