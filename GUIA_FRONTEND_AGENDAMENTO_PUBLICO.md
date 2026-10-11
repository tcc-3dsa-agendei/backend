# Guia para o agente do frontend: agendamento público pelo cliente

## 1. Objetivo e contexto

Adapte o frontend ao fluxo já implementado neste backend. A empresa cadastra serviços e dias de atendimento, obtém um link fixo e o compartilha. O cliente acessa esse link, escolhe serviço, data e horário e agenda sem login, informando nome, e-mail e telefone obrigatórios.

A empresa continua consultando, editando, excluindo e alterando o status das reservas em sua área autenticada. A criação administrativa foi removida: **`POST /appointments` agora retorna `404`**.

Este documento foi conferido com o código do backend em 11/10/2026. O repositório do frontend não foi inspecionado; nomes de componentes, organização de arquivos, framework e bibliotecas devem ser identificados no próprio projeto. Implemente a adaptação completa, reutilizando os padrões existentes de navegação, formulários, requisições, cache, feedback e acessibilidade.

### Entregas esperadas

- Página pública em `/agendar/:companyId`, acessível sem sessão e por acesso direto ao endereço.
- Ação na área da empresa para obter, copiar e abrir o link de agendamento.
- Remoção das chamadas e entradas de interface que dependem da criação administrativa antiga.
- Inclusão de `customerEmail` na consulta e edição administrativa, com compatibilidade para reservas antigas.
- Tipos, clientes de API, mocks, fixtures e testes atualizados.
- Verificação com os comandos de tipos, lint, testes e build disponíveis no frontend.

### Limites do trabalho

Não criar login ou conta de cliente, pagamento, envio de e-mail, verificação de contatos, cancelamento público ou gerenciamento público da reserva. O backend não fornece essas funcionalidades. Não criar uma segunda forma de agendamento administrativo usando a rota pública de maneira oculta. O painel pode oferecer o link para abrir a página pública.

Não adicionar dependências se os recursos necessários já existirem no projeto ou na plataforma. Não redesenhar partes não relacionadas do produto.

## 2. Fontes de verdade e levantamento inicial

Consulte estes arquivos se o backend estiver disponível no workspace do agente:

| Fonte | Informação |
| --- | --- |
| [CONTRATOS_DA_API.md](CONTRATOS_DA_API.md) | Contratos gerais, paginação e implantação |
| [src/routes/public/index.ts](src/routes/public/index.ts) | Consulta da empresa e disponibilidade |
| [src/routes/public/create-appointment.ts](src/routes/public/create-appointment.ts) | Criação pública e resposta reduzida |
| [src/routes/public/schema.ts](src/routes/public/schema.ts) | Validação dos parâmetros e da data |
| [src/routes/booking-link.ts](src/routes/booking-link.ts) | Link autenticado e exigência de configuração inicial |
| [src/routes/appointments/schema.ts](src/routes/appointments/schema.ts) | Campos, limites e validação de reservas |
| [src/routes/appointments/edit-appointment.ts](src/routes/appointments/edit-appointment.ts) | Edição parcial e reagendamento |
| [src/routes/appointments/update-status-appointment.ts](src/routes/appointments/update-status-appointment.ts) | Transições de status |
| [tests/README.md](tests/README.md) | Limites de verificação e defeitos conhecidos |

Com o backend em execução, a documentação interativa está em `/docs`, e o OpenAPI em `/docs/json`. As rotas de negócio abaixo são relativas à URL base da API e **não têm prefixo `/api`**. O prefixo `/api/auth` pertence à autenticação.

Antes de editar o frontend, localize:

1. Router, layouts e middleware/guards que exigem autenticação.
2. Cliente HTTP, configuração da URL da API, interceptadores de sessão e tratamento de erros.
3. Chamadas a `POST /appointments`, hooks de criação, botões, modais, páginas e testes associados.
4. Listagem, detalhes e formulário de edição de reservas; tipos compartilhados e schemas de formulário.
5. Telas de serviços e dias de atendimento, para orientar empresas sem configuração inicial.
6. Utilitários de data/fuso, telefone, preço, cache e componentes de feedback.

Preserve os recursos usados na edição ao remover o fluxo de criação antigo. Se houver tipos gerados pelo OpenAPI, siga o processo de geração existente em vez de alterar apenas arquivos gerados.

## 3. Resumo dos endpoints

| Método e rota | Sessão | Sucesso | Uso no frontend |
| --- | --- | --- | --- |
| `GET /booking-link` | Obrigatória | `200 { url }` | Link compartilhável da empresa autenticada |
| `GET /public/companies/:companyId` | Dispensada | `200 { company }` | Nome, fuso, expediente e catálogo público |
| `GET /public/companies/:companyId/availability?serviceId=...&date=YYYY-MM-DD` | Dispensada | `200 { slots }` | Horários disponíveis para serviço e data |
| `POST /public/companies/:companyId/appointments` | Dispensada | `201 { appointment }` | Criação pelo cliente |
| `GET /appointments` | Obrigatória | `200 { appointments, pagination }` | Listagem administrativa |
| `PUT /appointments/:appointmentId` | Obrigatória | `200 { appointment }` | Edição administrativa parcial |
| `DELETE /appointments/:appointmentId` | Obrigatória | `204`, sem corpo | Exclusão administrativa |
| `PATCH /appointments/:appointmentId/status` | Obrigatória | `200 { appointment }` | Mudança de status |
| `POST /appointments` | Não se aplica | `404` | Rota removida; eliminar seu uso |

Os IDs recebidos são UUID v7. A criação pública determina a empresa exclusivamente por `companyId` na URL, inclusive quando o navegador tem sessão de outra empresa.

## 4. Área autenticada: compartilhar o link

Adicione uma ação como “Link de agendamento” no local coerente com o painel existente. Consulte `GET /booking-link` usando o mecanismo atual de envio dos cookies de sessão.

Exemplo de resposta:

```json
{
  "url": "https://frontend.exemplo.com/agendar/019c0000-0000-7000-8000-000000000001"
}
```

Use o endereço retornado pela API. Ele é construído com `FRONTEND_URL` e o ID da empresa; não contém token, não muda por data/serviço e não precisa ser gerado a cada compartilhamento.

| Estado | Comportamento esperado |
| --- | --- |
| Carregando | Mostrar carregamento e impedir cópia de um valor ainda indisponível |
| `200` | Exibir endereço e permitir copiar/abrir; informar quando a cópia for concluída |
| Falha ao copiar | Manter o endereço visível para cópia manual |
| `422` | Orientar a cadastrar pelo menos um serviço e um dia de atendimento, com acesso às telas existentes |
| `401` | Aplicar o tratamento de sessão expirada existente na área administrativa |
| Falha de rede ou `500` | Exibir erro recuperável e permitir nova consulta |

O `422` não informa separadamente qual cadastro está faltando. Não inventar essa distinção com base no texto da mensagem. A existência do link também não garante vagas para uma data específica.

Se o resultado for mantido em cache, atualize-o após alterações em serviços/expedientes que possam mudar a configuração inicial. Não oferecer a cópia de um link como “pronto para uso” quando a consulta atual retorna `422`.

## 5. Página pública `/agendar/:companyId`

### 5.1 Acesso e carregamento da empresa

Coloque a página fora dos guards e layouts que obrigam login. Verifique também middleware global, loaders, renderização no servidor e interceptadores: a página deve abrir em janela anônima sem depender de sessão carregada. A API pública não precisa de cookies ou token; o cliente HTTP deve permitir chamadas públicas sem redirecionar para login.

Configure o roteamento/hospedagem para que acessar ou atualizar diretamente `/agendar/:companyId` funcione. Não basta funcionar somente após navegar pela página inicial.

Consulte `GET /public/companies/:companyId`:

```json
{
  "company": {
    "name": "Empresa Exemplo",
    "timeZone": "America/Sao_Paulo",
    "schedules": [
      { "weekDay": 1, "startTime": "09:00", "endTime": "18:00" }
    ],
    "services": [
      {
        "id": "019c0000-0000-7000-8000-000000000003",
        "name": "Corte",
        "description": null,
        "durationInMinutes": 30,
        "price": 25
      }
    ]
  }
}
```

Exiba o nome da empresa e seus serviços com nome, descrição quando houver, duração e preço quando informado. `description` e `price` podem ser `null`; preço `0` é um valor válido e não equivale a preço ausente. Use a convenção monetária já adotada pelo produto: essa resposta não contém código de moeda.

`services` contém todo o catálogo público, sem paginação. `schedules` contém os dias cadastrados, ordenados por `weekDay`, no máximo sete. Domingo é `0`, segunda é `1` e sábado é `6`; os horários são strings `HH:mm`.

Uma empresa existente pode retornar listas vazias com `200`. Mostre “Agendamento indisponível no momento” ou mensagem equivalente quando não houver serviços ou expediente, sem renderizar uma seleção impossível. Em `404`, mostre que a empresa/link não foi encontrado; em `422` para ID inválido, mostre link inválido. Falhas de rede/servidor devem ter opção de tentar novamente.

Essa consulta não fornece CNPJ, e-mail da empresa ou dados de clientes. Não buscar esses dados por endpoints administrativos para completar a página pública.

### 5.2 Serviço, data e horários

Depois de selecionar um serviço e uma data, consulte a disponibilidade com os dois parâmetros:

```http
GET /public/companies/019c0000-0000-7000-8000-000000000001/availability?serviceId=019c0000-0000-7000-8000-000000000003&date=2030-01-07
```

```json
{
  "slots": [
    { "startAt": "2030-01-07T12:00:00.000Z", "endAt": "2030-01-07T12:30:00.000Z" },
    { "startAt": "2030-01-07T12:15:00.000Z", "endAt": "2030-01-07T12:45:00.000Z" }
  ]
}
```

Use exclusivamente os intervalos retornados para a seleção pública. O backend já considera duração completa, fechamento, reservas ocupadas, cancelamentos, horários passados e grade de 15 minutos desde a abertura. Não recalcular vagas no frontend a partir do expediente. Uma abertura às `09:07` gera inícios como `09:07`, `09:22` e `09:37`, não uma grade fixa de quartos de hora no relógio.

Regras de estado:

- Ao mudar empresa, serviço ou data, limpe a seleção de horário anterior.
- Associe o cache da disponibilidade a `companyId`, `serviceId` e `date`.
- Durante a nova consulta, impeça envio com slots antigos. Descarte respostas atrasadas de uma seleção anterior usando o mecanismo existente no projeto.
- `slots: []` é sucesso sem vagas; apresente “Nenhum horário disponível nesta data” e permita escolher outra data.
- Um erro de consulta não deve ser apresentado como “sem vagas”. Mostre erro e opção de repetir a consulta.
- Identifique cada opção pelo instante completo `startAt`, não somente pelo texto `HH:mm`.

### 5.3 Fuso horário: requisito funcional

A data da consulta é a data civil da agenda em `company.timeZone`, que reflete a configuração do backend. O fuso do dispositivo pode ser diferente. Não fixar `America/Sao_Paulo` no frontend; esse é apenas o padrão atual.

Guarde a data escolhida como `YYYY-MM-DD`, sem convertê-la inadvertidamente para a data UTC ou para a data do navegador. Para determinar “hoje” e limites de datas na página pública, use o fuso retornado pela empresa. Evite derivar a data selecionada com `toISOString().slice(0, 10)` sobre uma meia-noite local.

Formate os instantes retornados com o fuso da empresa. Exemplo de uso da plataforma, caso o projeto não tenha um utilitário equivalente:

```ts
const formatTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: company.timeZone,
  hour: "2-digit",
  minute: "2-digit"
})

const label = formatTime.format(new Date(slot.startAt))
```

No exemplo anterior, `2030-01-07T12:00:00.000Z` aparece como `09:00` em `America/Sao_Paulo`. A confirmação também deve usar esse fuso. Identifique na interface que os horários são os da empresa.

Envie ao backend o `startAt` original do slot selecionado. Não reconstrua o instante concatenando a data com o texto do horário nem acrescente `-03:00` fixo. Em mudanças de horário de verão, duas opções podem ter o mesmo horário local e instantes distintos; preserve ambas e diferencie a apresentação quando necessário, por exemplo com o offset.

### 5.4 Formulário do cliente e criação

| Campo | Obrigatório | Regra do backend |
| --- | --- | --- |
| `serviceId` | Sim | UUID v7 de serviço pertencente à empresa da URL |
| `startAt` | Sim | Instante ISO 8601 com offset ou `Z`; segundos/frações iguais a zero; usar o valor do slot |
| `customerName` | Sim | Texto não vazio após remover espaços nas extremidades; máximo de 150 caracteres |
| `customerEmail` | Sim | E-mail válido; máximo de 254 caracteres; não aceita `null` |
| `customerPhone` | Sim | Telefone válido pela regra brasileira já existente no backend |
| `notes` | Não | Texto com até 2.000 caracteres após trim; pode ser omitido ou `null` |

Reutilize os campos e validadores existentes. Para telefone, preserve a máscara/experiência já adotada e evite introduzir uma regra mais restritiva sem necessidade; o backend valida com `isValidPhone(..., { version: 2 })` e normaliza com `parsePhone`. Para e-mail, a API não aplica trim automaticamente: remova espaços nas extremidades antes de validar/enviar o formulário.

Use labels visíveis, indicação dos campos obrigatórios, mensagens de erro associadas aos inputs e os componentes acessíveis existentes. A seleção de horário e o envio devem funcionar por teclado e em telas pequenas.

Envie JSON para `POST /public/companies/:companyId/appointments`:

```json
{
  "serviceId": "019c0000-0000-7000-8000-000000000003",
  "startAt": "2030-01-07T12:00:00.000Z",
  "customerName": "Maria",
  "customerEmail": "maria@example.com",
  "customerPhone": "11987654321",
  "notes": "Observação opcional"
}
```

O schema é estrito: não envie `userId`, `companyId` no corpo, `endAt`, `status`, `price` ou propriedades adicionais da interface. O backend calcula o término com a duração atual do serviço e define o status como `scheduled`.

Desabilite o envio enquanto faltar seleção válida, houver erros de formulário ou já existir uma requisição em andamento. Não permita duplo clique gerar duas requisições. A API não oferece chave de idempotência; não configurar repetição automática do POST após falha de rede.

Resposta de sucesso, sempre `201`:

```json
{
  "appointment": {
    "id": "019c0000-0000-7000-8000-000000000002",
    "serviceId": "019c0000-0000-7000-8000-000000000003",
    "startAt": "2030-01-07T12:00:00.000Z",
    "endAt": "2030-01-07T12:30:00.000Z",
    "status": "scheduled"
  }
}
```

Mostre “Agendamento realizado” ou equivalente, com serviço e intervalo confirmado pela resposta. O término pode diferir da consulta anterior se a duração do serviço tiver mudado. Use `startAt` e `endAt` da criação como resultado final.

O status é “agendado”; não o apresente como `confirmed`. Não prometer envio de e-mail ou dizer que o contato foi verificado. A resposta não contém nome, e-mail, telefone ou observações do cliente e não deve ser tipada como uma reserva administrativa completa.

Não existe endpoint público para recuperar uma reserva pelo ID depois de atualizar a página, nem para cancelá-la. A tela de sucesso pode usar o resultado mantido em memória; não inventar uma consulta a `/public/.../appointments/:id` ou depender de um GET administrativo individual, que também não existe.

### 5.5 Erros e conflito de disponibilidade

Os erros de negócio seguem `{ "message": "..." }`. O contrato não fornece um mapa estruturado de erros por campo: use validação local para erros de formulário e apresente a mensagem da API como feedback geral, sem depender de comparação exata do texto.

| Situação | Ação esperada |
| --- | --- |
| `409` ao reservar | Informar que o horário ficou indisponível, limpar a seleção e recarregar a disponibilidade; preservar os contatos e observações digitados |
| `422` ao reservar | Mostrar erro de validação/regra; preservar formulário e permitir correção; atualizar disponibilidade quando houver indicação de horário inválido ou vencido |
| `404` em serviço/criação | Recarregar dados públicos para verificar se o serviço/empresa continua disponível e orientar nova seleção ou exibir indisponibilidade |
| Falha de rede ou `500` | Exibir feedback recuperável, encerrar o estado de envio e preservar os dados; não reenviar automaticamente |

Uma consulta de disponibilidade não bloqueia o horário. Outra pessoa pode reservá-lo antes do envio; somente `201` confirma que a criação foi concluída. Se a conexão cair sem resposta, não afirmar que a reserva certamente falhou: o backend pode tê-la concluído. Não adicionar um mecanismo de consulta/idempotência que a API não possui.

Não colocar contatos ou observações em URLs, parâmetros de analytics ou logs de erro. As mensagens vindas da API devem ser exibidas como texto, conforme o padrão do projeto.

## 6. Gestão administrativa das reservas

### 6.1 Tipos, listagem e detalhes

Acrescente `customerEmail: string | null` ao modelo administrativo, mocks e fixtures. O campo está presente na listagem e nas respostas administrativas; `null` corresponde a uma reserva antiga sem e-mail cadastrado. Exiba “Não informado” ou equivalente, sem fabricar um endereço.

Os instantes e timestamps recebidos em JSON são strings ISO, mesmo que o backend os modele internamente como `Date`. Preserve a estratégia de serialização já usada no frontend.

`GET /appointments` continua retornando `{ appointments, pagination }`. Mantenha `page`, `pageSize`, `from` e `to` existentes. `from` é inclusivo, `to` exclusivo, e `pageSize` tem máximo de 100. O serviço relacionado contém `id`, `name`, `description`, `durationInMinutes` e `price`. Não substituir a lista administrativa pelas respostas públicas, que não contêm dados de clientes.

### 6.2 Edição parcial e reservas antigas

`PUT /appointments/:appointmentId` aceita campos parciais, incluindo `customerEmail` quando preenchido com um e-mail válido:

```json
{
  "customerEmail": "novo@example.com"
}
```

Na criação pública, e-mail é obrigatório. Na edição de uma reserva antiga, não bloquear correções de nome, telefone ou observação só porque o e-mail original é `null`.

- Campo omitido preserva o valor salvo, inclusive `customerEmail: null`.
- O backend não aceita limpar e-mail com `null` ou `""`. Se o usuário não mudou o e-mail vazio de uma reserva antiga, omita o campo.
- Se houver tentativa de apagar um e-mail existente, explique a restrição no formulário em vez de enviar um valor inválido.
- Não enviar `customerPhone` novamente em uma correção de outro campo quando ele não foi alterado; preserve telefones antigos.
- Enviar `notes: null` permite limpar observações. Omitir `notes` mantém o valor anterior.
- Enviar apenas campos efetivamente alterados. Sem alterações, não fazer a requisição e manter “Salvar” desabilitado ou usar o comportamento equivalente existente.

Há um defeito conhecido do backend: enviar somente o `serviceId` atual ou somente o `startAt` atual pode retornar `500` por update vazio. O envio dos campos efetivamente alterados evita esse caso; não simule sucesso para um erro real nem acrescente dados fictícios ao payload. O corpo `{}` é rejeitado com `422`.

A edição administrativa conserva precisão de minutos, por exemplo `10:07`; não impor a grade pública de 15 minutos. Mudar apenas o início preserva a duração registrada; trocar o serviço usa a duração atual do novo serviço. O retorno do PUT é a fonte final para atualizar a interface.

**Não usar a disponibilidade pública como lista obrigatória de horários de edição.** Ela não exclui a própria reserva, aplica a grade pública e calcula a duração atual do serviço. Por isso, pode omitir horários válidos para a edição administrativa. Preserve a edição existente e trate a validação do PUT.

### 6.3 Status e exclusão

Preserve os endpoints autenticados e o isolamento por empresa. `DELETE` retorna `204` sem JSON. A atualização de status recebe somente `{ "status": "..." }` e segue:

| Estado atual | Próximos estados permitidos |
| --- | --- |
| `scheduled` | `confirmed`, `cancelled`, `no_show` |
| `confirmed` | `completed`, `cancelled`, `no_show` |
| `completed`, `cancelled`, `no_show` | Nenhum |

`completed` só é permitido após o término; `no_show`, após o início. Estados finais permitem correções cadastrais, mas não reagendamento ou reabertura. Em `409`, atualizar os dados e informar a disputa com outra alteração.

## 7. Testes e critérios de aceite

Use a infraestrutura já existente no frontend. Os mocks devem reproduzir envelopes, nulabilidade e códigos de resposta reais. Adicione testes de comportamento para as mudanças; evite testar detalhes internos dos componentes.

### Área da empresa

- [ ] Exibe, copia e abre o endereço retornado por `GET /booking-link`.
- [ ] Trata carregamento, falha de cópia, `401`, `422` de configuração e erro de rede.
- [ ] Atualiza o estado do link após os cadastros necessários.
- [ ] Nenhuma ação de produção chama `POST /appointments`; referências restantes só documentam/testam a remoção.
- [ ] Consulta, edição, exclusão e alteração de status continuam protegidas por sessão.
- [ ] Reserva com `customerEmail: null` é exibida e pode receber correção de outros campos.
- [ ] Edição de e-mail envia valor válido; e-mail nulo inalterado e telefone inalterado são omitidos.
- [ ] Edição sem mudança não envia requisição; edição para `10:07` não é bloqueada pela grade pública.

### Jornada pública

- [ ] Acesso direto e atualização da página funcionam sem sessão, inclusive em janela anônima.
- [ ] Sessão de uma empresa A não muda a empresa B indicada na URL pública.
- [ ] Carrega catálogo e trata descrição/preço nulos, preço zero e empresa sem configuração.
- [ ] Trata empresa inexistente, ID inválido e erros de rede/servidor.
- [ ] Consulta horários com os IDs corretos e a data `YYYY-MM-DD` no fuso da agenda.
- [ ] Só oferece slots retornados, incluindo abertura em minuto fora dos quartos de hora, como `09:07`.
- [ ] Troca de serviço/data limpa a seleção; respostas atrasadas não restauram slots antigos.
- [ ] Ausência de vagas é distinguida de falha na consulta.
- [ ] Navegador com fuso diferente exibe os horários da empresa e envia o ISO original do slot.
- [ ] Nome, e-mail e telefone são obrigatórios; erros impedem o envio; observações são opcionais.
- [ ] O corpo não inclui campos extras como `endAt`, `status` ou `userId`.
- [ ] Duplo clique não duplica a requisição; POST não tem retry automático.
- [ ] `201` mostra o resultado da resposta sem prometer e-mail ou status `confirmed`.
- [ ] `409` preserva o formulário, limpa o horário e recarrega a disponibilidade.
- [ ] `422`, `404` e falha de rede encerram o loading e oferecem uma recuperação coerente.
- [ ] Formulário e seleção de horários funcionam por teclado e em tela pequena.

Além dos testes automatizados, verifique no navegador o fluxo empresa → copiar link → abrir sem sessão → reservar → consultar a reserva na área da empresa, em um ambiente de desenvolvimento/teste preparado. Confira o comportamento de CORS e cookies nesse ambiente. Não criar reservas de teste em produção.

Ao entregar, informe os arquivos alterados, comandos executados, resultado das verificações e qualquer limitação ainda existente. Não apresentar testes com mocks como comprovação de integração com banco real.

## 8. Configuração, ordem de publicação e limites conhecidos

O frontend deve usar sua configuração existente de URL base da API. `FRONTEND_URL` é uma variável do backend: define a origem aceita pelo CORS e a base do link compartilhável. Não copiar segredos ou configuração de banco para o frontend. Uma página pública dispensa autenticação, mas requisições do navegador continuam sujeitas ao CORS configurado.

Para publicação coordenada:

1. Confirmar com o responsável pelo backend o estado das migrations no ambiente. A migration [0005_appointment-customer-email.sql](src/db/migrations/0005_appointment-customer-email.sql) adiciona `customer_email` nullable; precisa ser aplicada antes de iniciar o backend atualizado. Migrations anteriores podem estar pendentes e ter pré-requisitos descritos no contrato geral.
2. Preparar e validar o frontend com as novas rotas e sem dependência do POST antigo.
3. Coordenar a entrada do backend e do frontend compatíveis. O frontend antigo perde a criação ao receber o backend novo; o frontend novo depende das rotas públicas disponíveis. Não assumir uma janela de compatibilidade que não existe.
4. Confirmar a URL pública, `FRONTEND_URL`, CORS, cookies administrativos e suporte a acesso direto à nova página no ambiente publicado.

No momento da implementação deste fluxo, a migration foi gerada, mas não aplicada pelo agente do backend. A suíte do backend passou com 175 testes, incluindo três falhas conhecidas marcadas como esperadas; TypeScript e lint passaram. Os testes usam banco/autenticação simulados e não comprovam migrations, concorrência em PostgreSQL real, CORS em navegador ou integração com o frontend.

Os contatos são declarados pelo cliente, sem comprovação de identidade. Nenhum e-mail é enviado. A página pública precisa funcionar integralmente sem acrescentar essas etapas ao fluxo.
