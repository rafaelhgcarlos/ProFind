# Estrutura autenticada do MVP

Este documento registra a estrutura visual iniciada na Issue #52, alinhada ao
plano da Issue #50, e sua integração com a criação de solicitações. Distribuição
e acompanhamento permanecem fora desta etapa.

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
- **Meus pedidos:** aparece como integração pendente da Issue #18.
- **Perfil:** mantém a rota existente `/cliente/perfil`.

O início lê categorias e especialidades pelo serviço de catálogo existente. Não
há cópia de categorias no componente, pedido fictício, profissional escolhido ou
confirmação simulada. Endereço pertence à solicitação, não
ao perfil privado do cliente.

### Profissional

- **Início, Perfil, Análise, Portfólio e Ajuda** permanecem acessíveis conforme os
  fluxos já entregues. Assim, cadastros pendentes, rejeitados ou suspensos ainda
  têm orientação, análise e o canal de ajuda existente.
- **Oportunidades** está visível como pendente da Issue #13. Quando integrada,
  novas oportunidades devem continuar condicionadas a aprovação ativa, versão,
  compatibilidade e disponibilidade.
- **Atendimentos** está visível como pendente da Issue #18. Restrições não apagam
  atendimentos existentes; o destino só será habilitado quando houver a tela que
  leia a autorização e os dados reais.

Mensagens, favoritos, comparação de profissionais e orçamento direcionado foram
retirados da jornada e da navegação do MVP.

## Dependências que permanecem abertas

- **#13:** oportunidades reais, elegibilidade e ações do profissional.
- **#18:** acompanhamento de solicitações e atendimentos persistidos.

A interface mantém as áreas futuras sem rotas vazias, dados artificiais ou
estados de sucesso locais.
