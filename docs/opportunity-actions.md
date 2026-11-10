# Aceite e recusa de oportunidades

Esta implementação complementa o núcleo transacional da #22 com os use cases
públicos da #17, o cancelamento/substituição da #21 e a agenda/início da #26,
integrados ao feed da #13.

## Use cases

- `acceptOpportunity({ requestId, expectedRound })`
- `declineOpportunity({ requestId, expectedRound })`
- `cancelAssignment({ requestId, expectedAssignmentId, reason })`
- `startAssignment({ requestId, expectedAssignmentId, expectedRound })`

Os nomes antigos `acceptRequest` e `refuseRequest` permanecem como aliases para
compatibilidade. O UID profissional sempre vem do Firebase Authentication; o
chamador não informa `professionalId`.

## Aceite transacional

A transação lê o pedido e a rodada esperada, o perfil público do próprio UID, o
contrato operacional versionado, o slot de disponibilidade, a recusa da rodada
e a reserva determinística. A política compartilhada da #14 valida novamente:

- pedido `OPEN`, rodada atual e prazo de aceite;
- profissional diferente do cliente;
- `APPROVED`, `active` e `approvedVersion == profileVersion`;
- snapshot aprovado igual ao perfil atual;
- categoria/especialidade e município IBGE;
- disponibilidade explícita, ausência de recusa/exclusão e de reserva.

O commit vencedor altera o pedido para `ASSIGNED`, fecha a rodada e cria a
atribuição, a reserva e o evento `REQUEST_ASSIGNED`. As Security Rules exigem o
mesmo conjunto de documentos no mesmo commit. O primeiro commit válido vence;
horário de clique do navegador não participa da decisão.

## Recusa e idempotência

A recusa cria somente
`serviceRequests/{requestId}/rounds/{roundId}/refusals/{professionalId}` e seu
evento. Ela não altera o pedido nem outros candidatos. O caminho inclui a
rodada, portanto uma nova rodada não herda recusas antigas.

IDs determinísticos de atribuição/evento e a leitura do resultado persistido
tornam retries idempotentes. Um retry de uma operação antiga nunca escreve na
rodada posterior.

## Cancelamento profissional e substituição

Somente o profissional apontado pela atribuição ativa pode cancelar. O motivo é
obrigatório e o commit encerra a atribuição, remove a reserva, limpa o responsável,
incrementa a rodada, reabre o mesmo pedido como `OPEN` e grava o evento
`PROFESSIONAL_CANCELLED_AND_REOPENED`. O cancelante fica excluído apenas da rodada
seguinte; recusas da rodada anterior continuam no histórico, mas não bloqueiam os
demais profissionais.

O cancelamento é permitido até o início do período, inclusive para um profissional
posteriormente suspenso ou desativado, porque isso trata um compromisso existente e
não concede acesso a novas oportunidades. Se o corte de aceite já passou, o pedido
permanece `OPEN` como pendência de intervenção ou reagendamento e não entra no feed.
Não existe promessa de substituição nem criação de outro pedido.

O ID determinístico da atribuição e o evento encerrado tornam retries idempotentes.
Um retry da atribuição antiga reconhece o cancelamento já persistido e nunca reabre
ou cancela a atribuição de um substituto posterior.

## Atendimentos e início

A agenda profissional consulta apenas pedidos `ASSIGNED` ou `IN_PROGRESS` cujo
`assignedProfessionalId` é o UID autenticado. A consulta é limitada, paginada pelo
ID do pedido e mantida em tempo real; os itens carregados são apresentados por data.
O detalhe combina o
resumo com `serviceRequestPrivate/{requestId}`; ao perder a atribuição, o listener
limpa imediatamente endereço e descrição da memória da tela.

O início revalida pedido, rodada, atribuição ativa, responsável atual, reserva e
início do período. O commit altera o pedido para `IN_PROGRESS`, registra
`startedAt`/`startedEventId` na atribuição e cria o evento imutável
`SERVICE_STARTED`. A reserva não é atualizada nem removida e continua protegendo o
slot durante a execução.

O evento usa ID determinístico por rodada. Uma resposta perdida ou repetição da
mesma operação retorna o resultado persistido sem criar outro evento. Uma operação
de atribuição antiga falha depois de cancelamento ou substituição. Suspensão,
desativação ou reanálise impedem novas oportunidades, mas não retiram as ações
autorizadas sobre um compromisso ainda atual.

## Resultados para a futura interface

| Código | Significado |
| --- | --- |
| `opportunity-taken` | outro profissional confirmou primeiro |
| `round-changed` | o card pertence a uma rodada antiga |
| `request-expired` | o limite temporal da #22 terminou |
| `professional-restricted` | perfil ausente, pendente, rejeitado, suspenso, inativo ou desatualizado |
| `not-eligible` | compatibilidade ou disponibilidade mudou |
| `excluded-from-round` | profissional cancelante não participa da rodada seguinte |
| `already-refused` | o profissional já recusou a rodada atual |
| `slot-conflict` | já existe reserva no mesmo período |
| `not-open` | pedido cancelado ou encerrado |
| `offline` | navegador explicitamente offline; nenhuma transação é iniciada |
| `unavailable` | falha transitória do Firestore |

Quando o SDK retorna `permission-denied` depois de uma disputa, uma leitura de
diagnóstico recupera apenas o motivo atual para feedback. Ela não grava dados e
não substitui a autorização da transação.

Não há confirmação otimista: o Promise resolve somente depois de
`runTransaction` confirmar o commit. Se o navegador informa estado offline, o
use case falha antes de chamar o repository. Transações do Firestore também não
são convertidas em writes enfileirados.

## Prova no emulador

Clientes autenticados independentes e barreiras após as leituras exercitam:

- dois profissionais no mesmo pedido;
- um profissional em dois pedidos no mesmo slot;
- aceite contra cancelamento OPEN do cliente;
- aceite contra edição relevante, suspensão e desativação;
- retries, rodada antiga, recusa, exclusão e bloqueio offline;
- writes diretos incompletos ou forjados;
- dados privados inacessíveis antes e legíveis somente após atribuição válida.
