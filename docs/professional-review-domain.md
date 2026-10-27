# Análise profissional e elegibilidade operacional

## Fonte de verdade

`professionalOperationalProfiles/{uid}` é a única fonte de verdade para análise e elegibilidade. O UID é o mesmo do Firebase Authentication e de `professionalProfiles/{uid}`. Não existe papel administrativo no perfil, em `localStorage` ou na URL.

Campos do documento operacional:

- `schemaVersion`: versão do contrato (`1`).
- `professionalId`: UID imutável do profissional.
- `reviewStatus`: `DRAFT`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED` ou `SUSPENDED`.
- `active`: ativação administrativa independente do estado de análise.
- `profileVersion`: versão atual dos dados analisáveis.
- `submittedVersion`: versão que está sob análise, ou `null`.
- `approvedVersion`: versão aprovada, ou `null`.
- `revision`: controle otimista das transições e da idempotência.
- `lastEventId`: evento determinístico `review-{revision}`.
- `professionalFeedback`: retorno que o profissional pode consultar.
- `approved*` e `eligibleCityIbgeCodes`: projeção protegida usada pelo aceite da solicitação.
- `updatedAt`: timestamp do servidor.

Um profissional é elegível para novas oportunidades somente quando `reviewStatus == APPROVED`, `active == true`, `approvedVersion == profileVersion` e a projeção aprovada corresponde ao perfil público atual. A elegibilidade da #22 continua verificando matching, rodada, prazo, recusas, disponibilidade e reserva.

## Estados e transições

| Ator | Origem | Destino | Condição |
| --- | --- | --- | --- |
| Profissional | `DRAFT` | `DRAFT` | salvar rascunho |
| Profissional | `DRAFT` | `UNDER_REVIEW` | perfil completo e submetido |
| Profissional | `CHANGES_REQUESTED` | `CHANGES_REQUESTED` | salvar correções sem reenviar |
| Profissional | `CHANGES_REQUESTED` | `UNDER_REVIEW` | reenviar a versão atual |
| Profissional | `UNDER_REVIEW` | `UNDER_REVIEW` | edição relevante cria nova versão |
| Profissional | `APPROVED` | `UNDER_REVIEW` | edição relevante invalida a elegibilidade anterior |
| Profissional | `REJECTED` | `REJECTED` | edição não remove a rejeição |
| Profissional | `SUSPENDED` | `SUSPENDED` | edição não remove a suspensão |
| Administrador | `UNDER_REVIEW` | `APPROVED` | decisão sobre `submittedVersion == profileVersion` |
| Administrador | `UNDER_REVIEW` | `CHANGES_REQUESTED` | feedback obrigatório |
| Administrador | `UNDER_REVIEW` | `REJECTED` | feedback obrigatório |
| Administrador | `APPROVED` | `SUSPENDED` | motivo obrigatório e desativação |
| Administrador | `REJECTED` ou `SUSPENDED` | `CHANGES_REQUESTED` | nova decisão com feedback |
| Administrador | `APPROVED` | `APPROVED` | ativar/desativar; ativação exige versão aprovada atual |

As demais transições são negadas. O profissional não pode aprovar, ativar, remover suspensão ou escrever a projeção aprovada. O administrador é reconhecido somente por `adminAccess/{uid}` ativo, conforme o contrato da #31.

## Versionamento

Incrementam `profileVersion` quando a alteração persistida é efetiva:

- nome público e chamada profissional;
- descrição e experiência;
- categorias, profissão/especialidades;
- município base, modo de atendimento, raio e municípios selecionados;
- foto profissional e metadados do portfólio.

Não incrementam a versão:

- disponibilidade geral e slots de agenda;
- telefone, visibilidade do contato e localização privada;
- avatar do cliente;
- gravação normalizada sem mudança nos campos analisáveis.

Perfil público, documento operacional e evento são gravados na mesma transação. Uma alteração de imagem só invalida a aprovação depois que os novos metadados ImageKit/Worker são persistidos com sucesso. Falha de upload ou persistência mantém a referência e a aprovação anteriores. Reservas existentes não são removidas por reanálise, suspensão ou desativação.

Toda decisão administrativa recebe `expectedVersion` e `expectedRevision`. Se o profissional editar ou outra decisão vencer a disputa, o retry do Firestore não troca silenciosamente a versão esperada. O serviço retorna versão ou revisão desatualizada. O ID derivado da revisão impede eventos duplicados.

## Histórico e privacidade

Eventos legíveis pelo profissional e pela administração ficam em `professionalOperationalProfiles/{uid}/events/{review-revision}`. Cada evento registra ator autenticado, papel, profissional, ação, estados, versão do perfil, versão analisada, motivo e timestamp do servidor.

Feedback destinado ao profissional fica no evento e em `professionalFeedback`. Notas internas ficam separadas em `professionalReviewInternal/{uid}/events/{review-revision}`. Somente administradores ativos podem lê-las ou criá-las; elas não entram no perfil público nem no documento operacional legível pelo profissional.

## Atomicidade e concorrência

As operações reutilizáveis estão em `professional-review.service.ts` e `professional-review.repository.ts`. A aprovação copia a projeção de matching a partir do perfil lido na mesma transação. Suspensão e ativação não alteram solicitações, atribuições ou reservas existentes.

Se uma restrição concorrer com um aceite da #22, o Firestore serializa as transações:

- aceite confirmado primeiro: atribuição e reserva permanecem; a restrição impede novos aceites;
- restrição confirmada primeiro: o aceite relê a elegibilidade e é negado.

Não há cancelamento silencioso de compromisso.

## Consultas e índices

- documento operacional: proprietário ou administrador ativo;
- lista operacional: somente administrador ativo, para a futura fila da #32;
- histórico: próprio profissional e administração;
- notas internas: somente administração.

Esta entrega usa leituras por caminho e não exige índice composto novo. Os índices da #22 permanecem em `firestore.indexes.json`.

## Perfis legados e migração futura

Perfis sem documento operacional não recebem aprovação automática. Na primeira gravação legítima do próprio perfil, o cliente cria atomicamente um documento `DRAFT` ou `UNDER_REVIEW`, versão `1`, inativo e sem projeção aprovada.

Uma migração futura pode criar somente documentos ausentes, de forma incremental e idempotente, nesse mesmo estado seguro. Documentos operacionais do contrato anterior que não tenham `schemaVersion`, `revision` e os campos de auditoria também devem ser atualizados por ferramenta confiável antes de decisões administrativas; até lá, as Rules falham fechadas. A migração não deve inferir aprovação de `status == PUBLISHED`. Nenhuma migração remota foi executada nesta entrega.

## Contratos para as próximas telas

- #51 usará o salvamento transacional e `submitForReview` no autocadastro completo.
- #32 listará os documentos operacionais e chamará `decide`, `suspend` e `setActive`.
- A interface, quando exibir aprovação, deve usar “Cadastro aprovado — demonstração” e não sugerir identidade verificada ou garantia de qualidade.

## Prova local

Com JDK 21 ou superior selecionado:

```bash
npm run test:rules
```

`professional-review.rules.test.ts` usa clientes autenticados independentes para profissional, administrador e usuário comum. Cobre submissão, reenvio, versão antiga, autoelevação, reanálise por texto/imagem, disponibilidade, notas internas, retry e concorrência. `service-request.rules.test.ts` cobre a corrida entre restrição e aceite e a preservação do atendimento confirmado.
