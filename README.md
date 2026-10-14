# Agendei API

API de agendamento para empresas, com cadastro de serviços, horários de atendimento e reservas de clientes. Desenvolvida com TypeScript, Bun, Elysia, PostgreSQL, Drizzle ORM e Better Auth.

## Instalação e execução

### 1. Instale o Bun

No Linux ou macOS:

```sh
curl -fsSL https://bun.com/install | bash
```

No Windows, pelo PowerShell:

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

No Linux, o instalador precisa do pacote `unzip`. Abra um novo terminal após instalar e confirme:

```sh
bun --version
```

Consulte a [documentação oficial de instalação do Bun](https://bun.sh/docs/installation) para outras opções ou ajustes no `PATH`.

### 2. Instale as dependências

Na raiz do repositório:

```sh
bun install --frozen-lockfile
```

### 3. Configure o ambiente e o banco

Tenha uma instância PostgreSQL acessível e um banco criado para o projeto. Crie um arquivo `.env` na raiz com os valores do seu ambiente:

```dotenv
NODE_ENV=development
PORT=3333
DATABASE_URL=postgresql://usuario:senha@localhost:5432/agendei
BETTER_AUTH_URL=http://localhost:3333
BETTER_AUTH_SECRET=substitua-por-um-segredo-aleatorio-de-pelo-menos-32-caracteres
FRONTEND_URL=http://localhost:3000
SCHEDULING_TIME_ZONE=America/Sao_Paulo
```

| Variável | Finalidade |
| --- | --- |
| `DATABASE_URL` | URL de conexão com o PostgreSQL. |
| `BETTER_AUTH_URL` | URL base da API usada na autenticação. |
| `BETTER_AUTH_SECRET` | Segredo de autenticação com pelo menos 32 caracteres; substitua o exemplo. |
| `FRONTEND_URL` | Origem permitida no CORS e na autenticação; também compõe o link público de reserva. |
| `PORT` | Porta do servidor; padrão: `3333`. |
| `NODE_ENV` | `development`, `test` ou `production`; padrão: `development`. |
| `SCHEDULING_TIME_ZONE` | Fuso IANA dos horários de atendimento; padrão: `America/Sao_Paulo`. |

O Bun carrega o `.env` automaticamente. A configuração é validada antes da inicialização, inclusive nos comandos do Drizzle. O arquivo `.env` está ignorado pelo Git.

Aplique as migrations existentes ao banco configurado:

```sh
bun run db:migrate
```

### 4. Inicie o servidor

Em desenvolvimento, com reinício automático ao alterar arquivos:

```sh
bun run dev
```

Para executar sem observar alterações:

```sh
bun run src/index.ts
```

Com a configuração acima, a API fica em `http://localhost:3333` e a documentação interativa em [http://localhost:3333/docs](http://localhost:3333/docs). Os schemas completos de entrada e saída das rotas de negócio estão nessa documentação.

## Rotas da API

Os caminhos abaixo são relativos à URL base da API. Envie corpos JSON com `Content-Type: application/json`. Os identificadores de empresa, serviço, horário e agendamento são UUIDs v7.

### Autenticação

As rotas `/api/auth` e `/api/auth/*` são atendidas pelo Better Auth. Os principais endpoints são:

| Método | Rota | Finalidade |
| --- | --- | --- |
| `POST` | `/api/auth/sign-up/email` | Cadastrar uma empresa com `name`, `email`, `password` e `cnpj`. |
| `POST` | `/api/auth/sign-in/email` | Entrar com `email` e `password`. |
| `POST` | `/api/auth/sign-out` | Encerrar a sessão. |
| `GET` | `/api/auth/get-session` | Consultar a sessão atual. |

O cadastro exige CNPJ válido e único e senha de 8 a 128 caracteres. A autenticação usa cookie de sessão; preserve o cookie recebido no cadastro/login e envie-o nas requisições protegidas. No frontend, use `credentials: "include"` nas chamadas com `fetch`.

### Horários de atendimento — sessão obrigatória

| Método | Rota | Finalidade |
| --- | --- | --- |
| `POST` | `/schedules` | Criar um dia de atendimento. |
| `GET` | `/schedules` | Listar os horários da empresa autenticada. |
| `GET` | `/schedules/:scheduleId` | Consultar um horário. |
| `PUT` | `/schedules/:scheduleId` | Atualizar os campos informados de um horário. |
| `DELETE` | `/schedules/:scheduleId` | Excluir um horário. |

Exemplo de criação:

```json
{
  "weekDay": 1,
  "startTime": "09:00",
  "endTime": "18:00"
}
```

`weekDay` vai de `0` (domingo) a `6` (sábado). Os horários usam `HH:mm` no fuso configurado; o término deve ser posterior ao início. É permitido um registro por dia da semana.

### Serviços — sessão obrigatória

| Método | Rota | Finalidade |
| --- | --- | --- |
| `POST` | `/services` | Criar um serviço. |
| `GET` | `/services` | Listar serviços com paginação. |
| `GET` | `/services/:serviceId` | Consultar um serviço. |
| `PUT` | `/services/:serviceId` | Atualizar os campos informados de um serviço. |
| `DELETE` | `/services/:serviceId` | Excluir um serviço. |

Exemplo de criação:

```json
{
  "name": "Corte de cabelo",
  "description": "Corte e finalização",
  "durationInMinutes": 30,
  "price": 50
}
```

`name` e `durationInMinutes` são obrigatórios. A duração deve ser um inteiro entre 5 e 1440 minutos. `description` e `price` são opcionais e aceitam `null`; o preço deve ser não negativo e ter até duas casas decimais.

### Agendamentos — sessão obrigatória

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/appointments` | Listar agendamentos com serviço associado, paginação e filtros de período. |
| `PUT` | `/appointments/:appointmentId` | Atualizar dados do cliente, observações, serviço ou início da reserva. |
| `PATCH` | `/appointments/:appointmentId/status` | Alterar o status usando um corpo como `{"status":"confirmed"}`. |
| `DELETE` | `/appointments/:appointmentId` | Excluir um agendamento. |

As listagens de serviços e agendamentos aceitam `page` (padrão `1`) e `pageSize` (padrão `20`, máximo `100`). Retornam a coleção e `pagination`, com `page`, `pageSize` e `hasNext`.

Em `/appointments`, `from` é o limite inclusivo e `to` o limite exclusivo para o início do agendamento. Ambos usam ISO 8601 com offset; `to` deve ser posterior a `from`.

Transições de status permitidas:

- `scheduled` → `confirmed`, `cancelled` ou `no_show`.
- `confirmed` → `completed`, `cancelled` ou `no_show`.
- `completed`, `cancelled` e `no_show` são finais.

Só é possível concluir após o término ou marcar ausência após o início. Alterações de serviço ou horário exigem status `scheduled` ou `confirmed` e passam novamente pela validação de disponibilidade.

### Link de reserva — sessão obrigatória

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/booking-link` | Retornar `{"url":"<FRONTEND_URL>/agendar/<companyId>"}`. |

É necessário cadastrar pelo menos um serviço e um dia de atendimento antes de obter o link. `companyId` corresponde ao ID do usuário da empresa. A página `/agendar/:companyId` deve ser implementada no frontend.

### Reservas públicas — sem sessão

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/public/companies/:companyId` | Consultar nome, fuso, horários e serviços da empresa. |
| `GET` | `/public/companies/:companyId/availability` | Consultar horários livres com `serviceId` e `date` (`YYYY-MM-DD`) obrigatórios na query. |
| `POST` | `/public/companies/:companyId/appointments` | Criar uma reserva de cliente com status inicial `scheduled`. |

Exemplo de consulta:

```text
/public/companies/<companyId>/availability?serviceId=<serviceId>&date=2026-11-10
```

Exemplo de corpo para criar uma reserva (substitua o ID e escolha um horário futuro retornado pela disponibilidade):

```json
{
  "serviceId": "<serviceId>",
  "customerName": "Maria Silva",
  "customerEmail": "maria@example.com",
  "customerPhone": "11987654321",
  "startAt": "2026-11-10T09:00:00-03:00",
  "notes": "Primeira visita"
}
```

Todos os campos, exceto `notes`, são obrigatórios. `startAt` deve ser um instante ISO 8601 com offset e precisão de minutos; `endAt` é calculado pela duração do serviço. A disponibilidade considera o expediente, a grade de 15 minutos desde a abertura, horários passados e reservas não canceladas. A criação revalida o horário e pode retornar conflito se ele tiver sido ocupado após a consulta.

A criação de agendamentos ocorre pela rota pública acima; não existe `POST /appointments`.

### Respostas

Nas rotas de negócio, criações retornam `201`, consultas e atualizações `200`, e exclusões `204` sem corpo. Erros usam `{"message":"..."}`, com códigos como `401` (sessão inválida), `404` (recurso inexistente), `409` (conflito), `422` (validação/regra de negócio) e `500` (erro interno). As rotas protegidas restringem os dados à empresa autenticada.

## Comandos úteis

| Comando | Finalidade |
| --- | --- |
| `bun run dev` | Executar em desenvolvimento com watch. |
| `bun run build` | Gerar executáveis para Linux x64 e Windows x64. |
| `bun run db:generate` | Gerar migrations após mudanças nos schemas. |
| `bun run db:migrate` | Aplicar migrations ao banco configurado. |
| `bun run db:studio` | Abrir a interface do Drizzle Studio. |
| `bun run test` | Executar os testes automatizados. |
| `bun run test:coverage` | Executar testes com cobertura. |

Os testes usam sessões e banco simulados e não precisam de PostgreSQL ou servidor em execução. Consulte [tests/README.md](tests/README.md) para detalhes, limites e defeitos conhecidos cobertos por falhas esperadas.
