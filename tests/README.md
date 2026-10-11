# Testes automatizados

Requer Bun e as dependências do projeto instaladas. Não exige PostgreSQL, Supabase ou servidor HTTP em execução.

```sh
bun run test
bun run test:coverage
bun test tests/api.test.ts
```

Os testes exercitam os schemas, horários no fuso do estabelecimento, disponibilidade, respostas HTTP, filtros por proprietário, criação/edição/exclusão, proteção de reservas futuras, transições de status e sanitização de erros/logs. O fluxo público cobre ausência de sessão, campos obrigatórios, projeções sem dados privados, link fixo, grade de 15 minutos desde a abertura, duração, fechamento, horários passados, transições de horário de verão, exclusão de cancelamentos nos filtros SQL e conflito entre consulta e criação. Também verifica a remoção da criação administrativa, e-mails nulos em reservas antigas e precisão de minutos na edição. As requisições usam `app.handle`, sem abrir portas. Sessões e respostas do banco são simuladas; os filtros SQL e a validação de updates do Drizzle são reais.

`setup.ts` é carregado pelo `bunfig.toml`: substitui as variáveis de ambiente por valores fictícios e bloqueia consultas/conexões não simuladas. Não usa credenciais de `.env`, executa migrations ou modifica dados reais. O relógio fica fixo nos testes temporais e é restaurado ao final de cada caso. Não execute estes testes com `--concurrent`, pois usam spies e relógio compartilhados.

## Defeitos conhecidos

Três casos usam `test.failing` e verificam o comportamento desejado:

- Reenviar apenas o serviço atual deve retornar `200` (atualmente retorna `500`).
- Reenviar apenas o início atual deve retornar `200` (atualmente retorna `500`).
- CNPJs alfanuméricos devem ser aceitos e preservar letras (atualmente são rejeitados).

Esses casos executam normalmente, mas a falha esperada conta como aprovação no Bun. Quando uma correção fizer o teste passar, o runner sinalizará uma aprovação inesperada; remova `.failing` desse caso. Uma execução verde não significa que esses defeitos foram corrigidos.

O antigo caso de formulário de origem não confiável em `POST /appointments` foi substituído por testes que exigem `404` nessa rota removida, com ou sem sessão. Isso não representa uma correção geral de proteção de origem nas demais rotas; a nova criação é pública por definição.

## Limites

Esta suíte não comprova autenticação por cookies em um navegador, aplicação de migrations, políticas RLS, integridade/concorrência no PostgreSQL real nem comportamento sob carga. Essas verificações precisam de testes de integração em banco isolado; os mocks não substituem bloqueios ou constraints reais.
