# Estrutura autenticada do MVP

Este documento registra a primeira etapa visual da Issue #52, alinhada ao plano
da Issue #50. A entrega organiza a navegação e o início do cliente sem antecipar
os fluxos de solicitação, distribuição ou acompanhamento.

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
- **Solicitar serviço:** leva por hash ao catálogo na mesma página e posiciona o
  foco no filtro. A seleção é apenas local e informa que nenhum pedido foi criado.
- **Meus pedidos:** aparece como integração pendente das Issues #11 e #18.
- **Perfil:** mantém a rota existente `/cliente/perfil`.

O início lê categorias e especialidades pelo serviço de catálogo existente. Não
há cópia de categorias no componente, pedido fictício, profissional escolhido ou
confirmação simulada. Endereço continuará pertencendo à futura solicitação, não
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

- **#11:** formulário, validação e persistência da solicitação, inclusive
  especialidade, endereço, data e período, além da retomada da intenção após o
  login.
- **#13:** oportunidades reais, elegibilidade e ações do profissional.
- **#18:** acompanhamento de solicitações e atendimentos persistidos.

Até essas integrações, a interface identifica cada área como pendente e não cria
rotas sem conteúdo, dados artificiais ou estados de sucesso locais.
