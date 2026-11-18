# Estrutura autenticada do MVP

Este documento registra a conclusão das integrações da Issue #52, alinhada ao
plano da Issue #50. A estrutura visual aprovada foi mantida e agora aponta para
solicitações, acompanhamento, oportunidades, atendimentos e operação reais.

## Estrutura compartilhada

- Sidebar no desktop e navegação inferior no celular usam os mesmos destinos e
  componentes dos layouts autenticados.
- O cabeçalho informa área e página atual, concentra alternância de modo,
  preferência de tema (Claro, Escuro ou Sistema) e menu da conta.
- A navegação mobile reserva espaço para a barra inferior e respeita a safe area,
  para que conteúdo e ações não fiquem encobertos.
- Links ativos usam `aria-current`; ações futuras permanecem desabilitadas com
  uma explicação acessível, em vez de apontar para rotas vazias.
- O conteúdo usa os tokens existentes de verde petróleo, menta, superfícies,
  contraste e foco. Grades e colunas usam limites flexíveis para funcionar de
  320 a 1440 px e com zoom de 200% sem exigir largura mínima da página.

## Navegação por papel

### Cliente

- **Início:** saudação, orientação e catálogo real.
- **Solicitar serviço:** abre o formulário e preserva a especialidade escolhida
  no catálogo, inclusive quando o login é necessário.
- **Meus pedidos:** lista e detalha somente pedidos da conta, com listeners em
  tempo real, histórico, responsável atual e ações permitidas.
- **Perfil:** mantém a rota existente `/cliente/perfil`.

O início lê categorias e especialidades pelo serviço de catálogo existente e
assina pedidos **OPEN**, **ASSIGNED** e **IN_PROGRESS** da conta. Quando há
pedidos ativos, até o limite seguro de 50 aparecem antes do catálogo usando o mesmo
**ClientRequestCard** da listagem. A ordenação é determinística: data do serviço,
período manhã/tarde/noite, criação mais recente e identificador. **Meus
pedidos** mantém o acesso à lista completa.

Sem pedidos ativos, a saudação, a busca no catálogo e o CTA **Solicitar
serviço** continuam sendo a hierarquia principal. A especialidade selecionada é
transportada em **?specialty=** até o formulário; a rota completa é preservada
pelo redirecionamento de autenticação. Não há cópia de categorias no
componente, pedido fictício, profissional escolhido ou confirmação simulada.
Endereço pertence à solicitação, não ao perfil privado do cliente.

Loading, vazio e erro não reutilizam dados como sucesso. Quando o Firestore
informa **fromCache**, cards e detalhes exibem **Estado salvo** no lugar do
status operacional e avisam que a situação atual precisa ser confirmada após a
reconexão.

### Profissional

- **Início, Perfil, Análise, Portfólio e Ajuda** permanecem acessíveis conforme os
  fluxos já entregues. Assim, cadastros pendentes, rejeitados ou suspensos ainda
  têm orientação, análise e o canal de ajuda existente.
- **Oportunidades** abre o feed real da Issue #13. Novas oportunidades continuam
  condicionadas à versão aprovada e ativa, compatibilidade regional/de
  especialidade e disponibilidade. O próprio serviço e as Rules mantêm a
  proteção; o menu não altera elegibilidade.
- **Atendimentos** abre compromissos reais. Restrições não apagam histórico nem
  compromissos existentes e as ações continuam validadas pelo domínio.

Mensagens, favoritos, comparação de profissionais e orçamento direcionado foram
retirados da jornada e da navegação do MVP.

### Administração

- **Análise:** **/admin/profissionais** integra a fila e o detalhe da #32.
- **Pedidos e Pendências:** **/admin/pedidos** e **/admin/pendencias** integram a
  visão operacional da #34.
- **Relatos:** **/admin/relatos** integra análise, ciência do cliente e resoluções
  permitidas.
- **Catálogo:** permanece desabilitado, pois não existe tela administrativa real.

## Limitações reais

- Não há pagamentos, garantias, certificação de identidade/qualidade, chat,
  favoritos, comparação de propostas ou escolha manual de prestador.
- Aprovação profissional é demonstrativa e não equivale a verificação real.
- Atendimento depende de elegibilidade, disponibilidade e aceite transacional;
  a interface não promete profissional nem prazo de chegada.
- O índice local para pedidos ativos precisa ser implantado junto às demais
  configurações Firestore em uma entrega autorizada; esta etapa não publica nem
  altera dados remotos.
