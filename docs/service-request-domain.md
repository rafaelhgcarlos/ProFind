# Solicitações, distribuição e reserva de agenda

Este documento descreve a base transacional da issue #22. Ela não cria formulários, feed ou operação administrativa: fornece contratos tipados, repository/service reutilizáveis e uma prova funcional no emulador do Firestore.

## Entidades e relacionamentos

```text
serviceRequests/{requestId}                         resumo sem contato/endereço
├── rounds/{roundId}                                rodada atual e histórico
│   └── refusals/{professionalId}                   decisão por profissional/rodada
├── assignments/{assignmentId}                      atribuição atual e histórica
└── events/{eventId}                                trilha imutável das transições

serviceRequestPrivate/{requestId}                   endereço, contato e observações
professionalOperationalProfiles/{professionalId}   aprovação/ativação protegida
professionalAvailability/{professionalId}/slots/{date_period}
professionalReservations/{professionalId}/slots/{date_period}
```

`serviceRequests` contém apenas campos necessários ao matching e ao estado: cliente, categoria, especialidade, município IBGE, data, período, limites temporais, rodada e ponteiros da atribuição. Endereço, telefone, nome de contato e observações ficam exclusivamente em `serviceRequestPrivate`.

O documento `professionalOperationalProfiles/{uid}` é a fonte única da análise e da elegibilidade implementadas na #43. Ele contém estado, ativação, versões e o snapshot dos campos de matching aprovados. O profissional só pode criá-lo ou atualizá-lo nas transições estritamente derivadas da própria gravação/submissão; decisões e ativação exigem a credencial administrativa da #31. Não existe autoaprovação em produção. O contrato completo está em `docs/professional-review-domain.md`.

## Períodos e vencimento

Política centralizada em `service-period-policy.ts`:

| Período | Limite local em `America/Sao_Paulo` |
|---|---|
| `MORNING` | 08:00–12:00 |
| `AFTERNOON` | 13:00–17:00 |
| `EVENING` | 18:00–22:00 |

- O aceite encerra 30 minutos antes do início do período (`acceptUntil`).
- O profissional designado pode cancelar somente antes de `periodStartAt`.
- Não há job de expiração. Depois de `acceptUntil`, novos aceites são negados; a solicitação permanece disponível para futura intervenção administrativa.
- Uma reserva usa a chave determinística `{YYYY-MM-DD}_{PERIOD}`. O mesmo profissional não consegue manter duas reservas nessa chave.
- O horizonte recomendado para criação é de 90 dias. A validação de criação será integrada pelo fluxo da #11.
- O modelo não cobre horários arbitrários, duração variável, sobreposição parcial ou serviços com vários dias.

## Estados e transições

| Origem | Ação/ator | Destino | Escritas atômicas |
|---|---|---|---|
| `OPEN` | Aceite por profissional elegível | `ASSIGNED` | solicitação, fechamento da rodada, atribuição, reserva e evento |
| `OPEN` | Recusa pelo profissional | `OPEN` | recusa da rodada e evento; não altera terceiros |
| `ASSIGNED` | Cancelamento pelo responsável antes do início | `OPEN` | solicitação, atribuição encerrada, remoção da reserva, nova rodada e evento |
| `ASSIGNED` | Início, integração futura | `IN_PROGRESS` | fora desta entrega |
| `IN_PROGRESS` | Conclusão, integração futura | `COMPLETED` | fora desta entrega |
| `OPEN`/`ASSIGNED` | Cancelamento do cliente, integração futura | `CANCELLED` | fora desta entrega |

`COMPLETED` e `CANCELLED` são terminais para a substituição. Um atendimento iniciado, um período vencido ou outra situação não segura retorna `intervention-required`; nenhum cliente web força a reabertura.

Na substituição, o documento original volta a `OPEN`, incrementa `round`, recebe `reopenReason: PROFESSIONAL_CANCELLATION` e aponta para uma nova rodada. Nenhuma solicitação duplicada é criada.

## Elegibilidade do aceite

O service faz validações legíveis antes de escrever e as Security Rules repetem as invariantes como autoridade final:

- UID autenticado igual ao proprietário do perfil e do contrato operacional;
- `reviewStatus: APPROVED` e `active: true`;
- `approvedVersion` igual a `profileVersion`;
- categoria, especialidade, município-base e cidades selecionadas iguais ao snapshot aprovado;
- categoria, especialidade e município da solicitação presentes no contrato aprovado;
- disponibilidade explícita no slot e ausência de reserva;
- solicitação `OPEN`, rodada atual, antes de `acceptUntil`;
- ausência de recusa ou exclusão nessa rodada;
- profissional diferente do cliente.

Mudanças relevantes no perfil incrementam `profileVersion`, registram um evento e colocam uma aprovação anterior em reanálise na mesma transação. Suspensão, desativação ou reanálise bloqueiam novos aceites, sem apagar atribuições e reservas já confirmadas.

## Invariantes e imutabilidade

- Cliente, matching, data, período e limites temporais não mudam durante aceite ou substituição.
- A atribuição ativa, a reserva e o evento de aceite são obrigatórios no mesmo commit.
- A reserva é criada em um caminho único por profissional/slot.
- `actorId`, `professionalId`, `clientId`, rodada e ponteiros devem concordar entre todos os documentos.
- Recusas e eventos são imutáveis e usam caminhos da rodada atual.
- A nova rodada não consulta nem copia recusas antigas.
- Quem cancelou fica em `excludedProfessionalIds` somente na rodada imediatamente seguinte.
- O cancelamento exige a atribuição esperada. Um retry encontra o evento antigo e retorna sucesso idempotente sem tocar em uma atribuição posterior.
- A remoção da reserva, o encerramento da atribuição e a reabertura são inseparáveis.
- Writes parciais, proprietário forjado e mudanças diretas de estado são negados pelas Rules.

## Privacidade e acesso

- O resumo consultado como oportunidade não contém contato, endereço ou observações.
- Profissionais com contrato operacional aprovado podem consultar resumos; o matching completo é revalidado no aceite.
- `serviceRequestPrivate/{requestId}` é legível apenas pelo cliente, administrador ativo ou profissional atualmente designado.
- Durante `OPEN`, nenhum candidato lê dados privados.
- Assim que ocorre cancelamento/reabertura, o antigo responsável perde novas leituras privadas. Depois da substituição, somente o novo responsável recebe acesso.
- Histórico de atribuições e eventos não aceita edição ou exclusão pelo cliente web.

As Rules usam leituras cruzadas (`get`, `getAfter`, `existsAfter`) e por isso as operações devem manter o conjunto documentado de escritas. O modelo atual permanece abaixo dos limites de acesso a documentos das Rules para transações atômicas; adicionar novas dependências exige recontar e retestar esses acessos.

## Consultas e índices

A consulta proposta para o feed usa:

- `status == OPEN`;
- igualdade em `categoryId`, `specialtyId`, `cityIbgeCode`, `serviceDate` e `period`;
- `acceptUntil > agora`;
- ordenação crescente por `acceptUntil`.
- limite de 50 documentos por consulta.

O índice composto correspondente está em `firestore.indexes.json`. O emulador executa a consulta real. O resumo é deliberadamente seguro para leitura por qualquer profissional operacionalmente aprovado; autorização de aceite nunca depende de filtros do frontend.

## Prova no emulador

Pré-requisitos: Node.js 22+, npm 10+ e JDK 21+.

```bash
npm run test:rules
```

`tests/service-request.rules.test.ts` usa instâncias autenticadas independentes. Barreiras mantêm duas transações depois das leituras iniciais antes de liberar os commits, produzindo contenção real para:

- dois profissionais no mesmo pedido;
- um profissional em dois pedidos no mesmo slot.

A suíte também cobre recusa isolada, substituição, retry, rodada antiga, vencimento, aprovação/ativação/versão, writes incompletos, falsificação de proprietário, privacidade e corrida entre cancelamento e novo aceite.

## Migração futura

A migração dos perfis existentes deve ser incremental, idempotente e executada por ambiente confiável:

1. Ler perfis sem alterar seu estado atual.
2. Gerar uma prévia dos campos de matching e da versão inicial.
3. Criar `professionalOperationalProfiles/{uid}` como não aprovado e inativo, usando precondição de documento ausente.
4. Nunca converter perfil legado em `APPROVED` ou `active: true` automaticamente.
5. Registrar o resultado por UID e permitir reexecução sem sobrescrever decisões administrativas.
6. Publicar índices e Rules antes de integrar as telas, depois executar novamente a prova no emulador e em um projeto de teste.

Não há script de migração nesta entrega e nenhum dado remoto é alterado.

## Próximas integrações

- #43/#51: versão do perfil, submissão e invalidação da aprovação após edição relevante.
- #32: criação e manutenção administrativa do contrato operacional.
- #11/#14: criação da solicitação e disponibilidade/compatibilidade.
- #17/#13: feed e aceite pela interface.
- #21: experiência de cancelamento e substituição.
- #34: pendências e intervenção administrativa.
