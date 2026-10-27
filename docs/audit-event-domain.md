# Trilha de eventos de domínio

## Estrutura consolidada

A trilha reutiliza os eventos transacionais das solicitações e da análise
profissional. Não existe uma coleção paralela `auditLogs`.

- `serviceRequests/{requestId}/events/{eventId}` registra a continuidade do
  atendimento.
- `professionalOperationalProfiles/{uid}/events/{eventId}` registra submissão,
  reenvio, reanálise, decisão, suspensão e ativação.
- `professionalReviewInternal/{uid}/events/{eventId}` contém somente a nota
  administrativa vinculada ao evento público da mesma revisão.

Todo novo evento público contém `eventId`, `entityType`, `entityId`, ator
autenticado, papel do ator, ação ou tipo, `reasonCode`, estado anterior e
posterior, timestamp do servidor e a versão ou rodada aplicável. `reason` é
reservado para feedback textual permitido ao profissional; notas internas não
são copiadas para o evento público.

Eventos legados sem `entityType`, `entityId` ou `reasonCode` continuam legíveis.
Os repositories derivam esses valores dos campos existentes. Novas gravações
precisam usar o contrato completo; nenhuma migração remota é exigida ou
executada por esta entrega.

## Eventos operacionais

| Evento | ID determinístico | Motivo | Vínculo atômico |
| --- | --- | --- | --- |
| `REQUEST_ASSIGNED` | `assigned-round-{n}` | `PROFESSIONAL_ACCEPTANCE` | solicitação, rodada, atribuição e reserva |
| `PROFESSIONAL_REFUSED` | `refused-round-{n}-{uid}` | `PROFESSIONAL_REFUSAL` | recusa do profissional na rodada |
| `PROFESSIONAL_CANCELLED_AND_REOPENED` | `reopened-round-{n}` | `PROFESSIONAL_CANCELLATION` | atribuição encerrada, reserva removida e nova rodada |

O cancelamento seguido de outro aceite preserva os eventos e atribuições das
rodadas anteriores. O profissional anterior pode consultar apenas os eventos
em que é o ator; ele não recupera o endereço ou contato privado após a
reabertura. O cliente e a administração podem consultar a cronologia completa
da solicitação.

Criação da solicitação, início, conclusão, cancelamento pelo cliente e
intervenção administrativa ainda não possuem operações web nesta base. As
Rules não aceitam eventos isolados para simular essas ações. Cada fluxo deverá
acrescentar seu evento determinístico e a validação atômica quando for
implementado, junto da #34 e das respectivas telas.

## Eventos de análise profissional

O ID é `review-{revision}`. A revisão do documento operacional cresce junto do
evento, tornando retries observáveis e idempotentes.

| Ação | `reasonCode` |
| --- | --- |
| `PROFILE_UPDATED`, `REANALYSIS_REQUIRED` | `PROFILE_DATA_CHANGED` |
| `PROFILE_SUBMITTED` | `PROFESSIONAL_SUBMISSION` |
| `PROFILE_RESUBMITTED` | `PROFESSIONAL_RESUBMISSION` |
| `APPROVED`, `CHANGES_REQUESTED`, `REJECTED` | `ADMIN_DECISION` |
| `SUSPENDED` | `ADMIN_SUSPENSION` |
| `ACTIVATED`, `DEACTIVATED` | `ADMIN_ACTIVATION_CHANGE` |

A decisão registra `profileVersion` e `reviewedVersion`. Alterações relevantes
criam uma nova versão e um evento na mesma transação. Uma edição administrativa
futura de dados cadastrais deverá registrar o administrador como ator; ela não
poderá reutilizar uma ação profissional.

## Atomicidade, integridade e idempotência

- `createdAt` precisa ser igual a `request.time`.
- `actorId` precisa ser o UID autenticado e `actorRole` precisa corresponder à
  operação permitida.
- `entityId`, `requestId` ou `professionalId`, rodada, versão e ponteiros do
  documento alterado precisam concordar.
- Eventos não podem ser criados depois da transição, alterados ou excluídos.
- Aceite, recusa e cancelamento sem o evento esperado são rejeitados.
- A revisão profissional precisa avançar exatamente uma unidade e apontar para
  o novo evento.
- IDs determinísticos fazem o retry retornar o resultado já confirmado, sem
  duplicar evento, atribuição ou decisão.
- Campos extras são negados nas novas gravações, impedindo incluir endereço,
  contato, documentos ou payload arbitrário na trilha.

## Consultas e permissões

Os repositories oferecem consultas decrescentes por `createdAt`, sempre com
limite entre 1 e 50:

- solicitação: cliente e administrador consultam a cronologia completa;
- profissional: consulta a solicitação com `actorId == UID`, recebendo somente
  seus próprios eventos, inclusive depois de uma substituição;
- análise: profissional consulta seu histórico e administrador consulta o
  histórico do profissional;
- notas internas: somente administrador ativo.

Queries sem limite, com limite superior a 50 ou que tentem consultar o ator de
outro profissional são negadas. O índice composto de coleção `events` para
`actorId ASC, createdAt DESC` está versionado em `firestore.indexes.json`.
Ordenação somente por `createdAt` usa o índice de campo único do Firestore.

## Limites no plano Spark

A trilha registra apenas operações confirmadas pelo Firestore. Ela não fornece
logs de tentativas negadas, chamadas ao Worker, indisponibilidade de rede,
telemetria externa, exportação, retenção legal ou busca global. A consulta é
por entidade e limitada a 50 itens; paginação e uma visão operacional agregada
ficam para o painel da #34.

O crescimento de eventos consome leituras, gravações e armazenamento do projeto
Firestore. Antes de ampliar o catálogo de eventos ou adicionar leituras
cruzadas nas Rules, os limites de acesso a documentos por transação devem ser
recontados e os testes do emulador repetidos.

Na edição Standard, a franquia gratuita vigente documentada pelo Firebase é de
1 GiB armazenado, 50.000 leituras por dia, 20.000 gravações por dia, 20.000
exclusões por dia e 10 GiB mensais de saída, aplicada a um único banco por
projeto. As cotas diárias reiniciam aproximadamente à meia-noite no horário do
Pacífico. Como cada transição grava o evento e os documentos de domínio
relacionados, ela consome mais de uma gravação. Os valores devem ser
reconfirmados na [documentação oficial de cotas do Firestore](https://firebase.google.com/docs/firestore/quotas)
antes de planejar capacidade.

## Cobertura pendente

- criação, início, conclusão, cancelamento pelo cliente e intervenção;
- auxílio administrativo que altere dados cadastrais;
- paginação por cursor e visão cronológica agregada do painel;
- observabilidade do Worker ou de ações externas ao Firestore.

Nenhuma permissão antecipada foi aberta para esses fluxos.
