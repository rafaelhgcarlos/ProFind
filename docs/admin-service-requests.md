# Consulta administrativa de pedidos

Esta entrega implementa somente a parte de consulta da issue #34. O painel em
`/admin/pedidos` lista e detalha solicitações de todos os clientes sem oferecer
ações que alterem atendimento, agenda ou histórico.

## Consultas

- A listagem usa `serviceRequests`, ordenação por `serviceDate` e ID, limite de
  12 itens na interface e cursor composto. O repository aceita no máximo 25
  itens por página e nunca carrega a coleção inteira.
- Os filtros disponíveis são estado do pedido, período discreto, intervalo de
  data agendada e identificador exato. A busca exata usa `get` no documento e
  não executa varredura.
- Município/UF vêm do documento privado lido individualmente para cada item da
  página autorizada. Endereço, contato e observações não são copiados para o
  resumo público.
- O detalhe limita o histórico aos 50 eventos mais recentes. Rodadas e
  atribuições usam os IDs determinísticos do domínio (`round-{n}`), também
  limitados às 50 rodadas mais recentes, sem depender de uma query da
  subcoleção. Ele apresenta o responsável atual e também atribuições anteriores.
- `OPEN` com `reopenReason: PROFESSIONAL_CANCELLATION` é exibido como procura de
  substituto. Os demais estados continuam usando `OPEN`, `ASSIGNED`,
  `IN_PROGRESS`, `COMPLETED` e `CANCELLED` do domínio existente.
- Pedido `OPEN` sem atribuição é sinalizado como ainda sem aceite. Se
  `acceptUntil` já passou, a interface sinaliza prazo encerrado. Nenhuma dessas
  condições é descrita como “sem candidatos”, pois a consulta não prova a
  ausência de profissionais elegíveis.

## Autorização e privacidade

Todas as rotas ficam sob `AdminAccessRoute`. As Rules exigem credencial ativa
em `adminAccess/{uid}` para a query global, para o endereço privado e para a
leitura das rodadas e atribuições. A implementação usa leituras determinísticas
nessas duas subcoleções e mantém a query dos eventos com limite máximo de 50.
Usuários comuns não conseguem repetir essas leituras diretamente pelo SDK.

Ao perder autorização, `AdminAccessRoute` deixa de renderizar o `Outlet`; a
página é desmontada, suas requisições deixam de publicar resultados pelo
controle de ciclo de vida e os dados permanecem apenas no estado local já
descartado.

Os índices das combinações de estado/período/data/ID estão versionados em
`firestore.indexes.json`. A prova no emulador cobre filtro combinado, cursor
real, busca exata, detalhe privado, limites e negação para conta comum.

## Limite da entrega parcial da #34

Continuam pendentes:

- filas de relatos de falta/problema e de profissionais desativados com agenda;
- verificação efetiva de ausência de profissionais elegíveis;
- reabertura administrativa, reagendamento e comunicação ao cliente;
- registro de resolução/motivo e demais intervenções auditadas;
- integração com a conclusão do atendimento e com os fluxos completos das
  issues #27 e #28.

Nenhuma operação remota, publicação de Rules/índices ou alteração de dados faz
parte desta entrega.
