# Cobertura consolidada das Security Rules

Este documento consolida a cobertura entregue pelas issues #31, #22, #43, #35 e #36. As Rules continuam em `firestore.rules`, com configuração de índices em `firestore.indexes.json`. O catálogo e as permissões da trilha estão detalhados em `audit-event-domain.md`.

## Matriz de autorização

| Recurso | Leitura | Escrita web |
| --- | --- | --- |
| `users/{uid}` | somente o próprio UID | criação e alterações limitadas; papéis somente `client`/`professional`; nenhum papel administrativo |
| `adminAccess/{uid}` | somente a própria credencial | sempre negada, inclusive para administrador |
| `adminData/**` | administrador ativo | negada |
| `clientProfiles/{uid}` | somente proprietário | somente proprietário, campos e imagem validados |
| `professionalProfiles/{uid}` | proprietário; perfil publicado mantém a leitura pública existente | proprietário, com sincronização obrigatória da análise para campos relevantes |
| `professionalPrivateProfiles/{uid}` | somente proprietário | somente proprietário e campos privados permitidos |
| `professionalOperationalProfiles/{uid}` | proprietário ou administrador; lista somente administrador | submissão/correção derivada validada ou decisão administrativa autorizada |
| `professionalOperationalProfiles/{uid}/events/**` | proprietário ou administrador | somente criação atômica com a transição; alteração e exclusão negadas |
| `professionalReviewInternal/{uid}/events/**` | somente administrador ativo | criação administrativa na mesma revisão; alteração e exclusão negadas |
| `professionalAvailability/{uid}/slots/**` | proprietário ou administrador | proprietário; não remove slot reservado |
| `serviceRequests/{id}` | partes, administrador ou profissional aprovado; `list` restrita ao feed compatível | apenas aceite/cancelamento transacional validado |
| `serviceRequestPrivate/{id}` | cliente, responsável atual ou administrador | negada no cliente web |
| rodadas, recusas, atribuições, reservas e eventos | partes mínimas documentadas | somente transições atômicas da #22 |
| `categories` e `specialties` | pública | negada; manutenção permanece em ambiente confiável |

Uma conta com ambos os papéis continua sujeita ao UID proprietário e às relações do atendimento. Ter os papéis `client` e `professional` não concede leitura privada de terceiros, acesso administrativo ou aprovação operacional.

## Consultas reais e índices

### Catálogo

Os repositories consultam `categories` e `specialties` com `orderBy('order', 'asc')`. São índices de campo único gerenciados automaticamente pelo Firestore. O emulador executa as mesmas consultas, inclusive como visitante, e confirma que nenhuma identidade web pode alterar o catálogo.

### Feed de oportunidades

`service-request.repository.ts` consulta:

- `status == OPEN`;
- igualdade em categoria, especialidade, município, data e período;
- `acceptUntil > agora`;
- ordenação por `acceptUntil`;
- limite de 50 resultados.

As Rules exigem profissional aprovado/ativo/com versão atual, documento `OPEN` e matching de categoria/especialidade/município. Uma consulta fora do matching falha como um todo, pois Rules não filtram resultados. O limite de 50 é aplicado pelo repository para limitar volume e custo; o aceite não confia nesse limite e revalida todas as invariantes.

O filtro temporal usa o instante calculado pelo repository. O aceite volta a exigir `request.time < acceptUntil`, evitando depender do relógio ou do resultado previamente carregado pelo frontend.

O índice composto necessário está versionado em `firestore.indexes.json`. Nenhum índice novo foi necessário nesta consolidação.

### Administração

A listagem de `professionalOperationalProfiles` é autorizada apenas para administrador ativo e foi validada no emulador. O repository de fila será implementado com a tela da #32; até existir uma consulta funcional dessa tela, não foi criado índice especulativo.

### Histórico de eventos

As cronologias são ordenadas por `createdAt` decrescente e limitadas a 50 itens. Cliente e administrador consultam os eventos de uma solicitação; profissionais usam também `actorId == UID` e recebem somente seus próprios eventos. O histórico de análise é restrito ao profissional afetado e à administração. O índice `events: actorId ASC, createdAt DESC` atende a consulta operacional filtrada.

## Invariantes protegidas

- Credenciais administrativas não podem ser criadas, alteradas ou excluídas pelo frontend.
- `ownerId`, ator, papel do ator, versão, rodada e timestamps não podem ser forjados.
- Alterações relevantes de perfil exigem incremento de versão, reanálise e evento no mesmo commit.
- Aprovação usa exatamente a versão submetida; ativação não contorna análise pendente.
- Feedback do profissional e notas internas ficam em documentos com acessos diferentes.
- Aceite exige atribuição, fechamento da rodada, reserva e evento no mesmo commit.
- Um slot aceita uma única reserva por profissional.
- Recusa pertence ao profissional autenticado e à rodada corrente.
- Cancelamento encerra a atribuição, remove a reserva, reabre uma única vez e cria nova rodada/evento atomicamente.
- Eventos são imutáveis. Eventos órfãos ou criados depois da transição são negados.
- Endereço e contato do atendimento nunca aparecem no resumo do feed.
- Restrição administrativa impede novos aceites, mas não apaga atribuições ou reservas confirmadas.
- Metadados ImageKit são limitados a HTTPS, finalidade e proprietário corretos; blobs, base64 e provider `MOCK` são negados.

## Suítes do emulador

- `firestore-privacy.rules.test.ts`: usuários, papéis, perfis, imagens, catálogo, administração e acesso cruzado.
- `professional-review.rules.test.ts`: submissão, versão, decisões, ativação, suspensão, notas, histórico e concorrência administrativa.
- `service-request.rules.test.ts`: query real, matching, aceite exclusivo, dupla reserva, recusa, substituição, privacidade e concorrência.

Os testes usam contextos autenticados independentes e `withSecurityRulesDisabled` apenas para fixtures e inspeção. As operações sob teste passam pelas Rules.

## Cobertura pendente

Permanecem fora do escopo porque ainda não existem os fluxos correspondentes:

- criação/cancelamento de solicitação pelo cliente e consultas completas do painel operacional (#34);
- fila e filtros da interface administrativa (#32);
- autocadastro completo da nova interface (#51), que consumirá os contratos já protegidos;
- distribuição, pagamentos, chat, documentos reais, reputação e notificações.

Esses recursos devem incluir Rules, queries e testes junto da implementação. Nenhuma permissão ampla foi aberta antecipadamente.
