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
