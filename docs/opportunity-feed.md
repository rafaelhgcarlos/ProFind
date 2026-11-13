# Feed profissional de oportunidades

O feed da issue #13 consome os mesmos contratos de elegibilidade e de ação das
issues #14 e #17. A interface não decide se um pedido pode ser aceito.

## Consulta em tempo real

Antes de abrir listeners de `serviceRequests`, o repositório observa o perfil
operacional e o perfil profissional do usuário autenticado. Os listeners do
feed só são criados quando `hasCurrentApprovedProfessionalAccess` confirma:

- análise `APPROVED` e conta ativa;
- `approvedVersion` igual à versão atual;
- categorias, especialidades e municípios iguais aos dados aprovados.

Cada consulta usa `status == OPEN` e uma combinação exata de categoria,
especialidade e município aprovados, com limite máximo de 50 documentos por
escopo. Esse formato usa os índices automáticos de igualdade do Firestore e
não condiciona a disponibilidade do feed à publicação de um índice composto
novo. Resultados de consultas paralelas são filtrados por prazo, ordenados,
paginados por cursor versionado e deduplicados. Não existe varredura global
nem escrita por candidato.

Depois da consulta, cada resumo é novamente filtrado pela política central com
disponibilidade, reserva, exclusão e recusa da rodada. O resumo profissional
contém somente IDs de catálogo, município IBGE, data, período, prazo e rodada;
identidade, contato e endereço do cliente permanecem fora do feed.

## Ciclo de vida

- Mudanças em pedido aberto atualizam os cards via `onSnapshot`.
- Perda de aprovação, ativação ou coerência de versão desmonta imediatamente
  os listeners de pedidos e limpa as páginas.
- Troca de conta ou desmontagem da rota encerra todos os listeners e remove os
  dados da sessão anterior.
- O vencimento também é aplicado por relógio local para remover cards cujo
  prazo passou sem depender de uma nova escrita no Firestore.
- Cada página possui seu próprio cursor e listener limitado; a interface
  deduplica IDs que mudam de página após uma atualização em tempo real.

## Aceite e recusa

Os botões chamam `acceptOpportunity` e `declineOpportunity`. O card fica
bloqueado enquanto a transação está pendente. Sucesso de aceite só é exibido
depois da resolução do commit; a consulta nunca substitui a revalidação
transacional. A recusa confirmada remove apenas o card daquele profissional e
continua vinculada à rodada atual.

## Detalhe pré-aceite — complemento da #13

Os cards não aceitam mais o atendimento diretamente. `Ver detalhes` abre a
rota protegida `/profissional/oportunidades/:requestId`, que permanece
recuperável após recarga. O aceite exige revisão na própria página e uma
confirmação explícita; somente depois do commit da transação da #17 a
interface encaminha para o atendimento da #26.

A descrição permitida antes do aceite, o nome do município e a UF ficam na
projeção dedicada `serviceRequestOpportunityDetails/{requestId}`. O documento
contém somente o contrato necessário para avaliar o trabalho e repete os
identificadores de categoria, especialidade, município IBGE, agenda e rodada
para validação de consistência. Ele nunca contém cliente, CEP, logradouro,
número, complemento, bairro, telefone, e-mail ou instruções privadas.

As Rules proíbem `list` nessa projeção e autorizam o `get` individual somente
quando todas as condições do feed ainda valem: pedido `OPEN`, prazo vigente,
perfil aprovado/ativo e compatível, disponibilidade, ausência de exclusão,
recusa e reserva conflitante. A criação do documento ocorre no commit atômico
do pedido. Na edição, o commit do domínio (pedido, privado, rodadas e evento)
permanece dentro do limite de expressões do Firestore e a projeção é
sincronizada logo depois, antes de o use case confirmar sucesso. As Rules
exigem que ela coincida integralmente com o resumo e os campos permitidos do
documento privado. Retry idempotente também repara uma sincronização pendente;
durante qualquer divergência a tela bloqueia o aceite.

Listeners do pedido e da projeção bloqueiam a ação quando outro profissional
aceita, o cliente cancela/edita, a rodada muda ou a autorização é perdida. Uma
mudança de conteúdo ou rodada exige nova confirmação de leitura. Dados vindos
somente do cache e oportunidades vencidas nunca habilitam o aceite. Abrir o
detalhe não escreve documentos, não reserva o período e não carrega o documento
privado.

Pedidos legados criados antes desta entrega não possuem a projeção. Nesses
casos, a rota informa que os detalhes ainda não estão disponíveis e nunca usa o
documento privado como fallback. A edição do próprio pedido sincroniza a
projeção; os demais pedidos abertos exigem um backfill administrativo
controlado antes da publicação da funcionalidade. Nenhum dado remoto foi
alterado nesta entrega.
