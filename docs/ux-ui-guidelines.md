# Diretrizes globais de UX/UI

Este documento materializa a Issue #41 e, junto ao Design System da Issue #3,
é requisito transversal para toda interface do ProFind. Ele orienta decisões de
experiência sem substituir as regras de negócio de cada feature.

## Princípios

1. **Mobile-first real:** desenhar primeiro a tarefa essencial no celular e
   expandir o contexto no desktop, sem apenas comprimir uma tela larga.
2. **Baixa fricção:** pedir somente a informação necessária no momento e
   eliminar etapas ou decisões sem consequência para a tarefa.
3. **Confiança antes da conversão:** dar visibilidade a identidade, reputação,
   experiência, fotos, área atendida e contexto do serviço antes de um acordo.
4. **Uma ação principal por contexto:** a ação prioritária deve ser inequívoca;
   alternativas usam hierarquia visual secundária.
5. **Progressive disclosure:** manter o essencial visível e revelar detalhes
   extensos sob demanda, preservando o contexto do usuário.
6. **Feedback imediato:** ações assíncronas comunicam loading e impedem envio
   duplicado; resultados comunicam sucesso, erro ou indisponibilidade.
7. **Consistência:** o mesmo conceito reutiliza os mesmos componentes, termos,
   ícones, cores e estados.
8. **Acessibilidade por padrão:** semântica, labels, teclado, foco visível,
   contraste e alvos de toque fazem parte da implementação inicial.
9. **Performance percebida:** usar skeletons coerentes com o conteúdo esperado,
   carregamento progressivo e evitar bloqueios de página sem necessidade.
10. **Privacidade visível:** explicar quando endereço, contato ou outros dados
    continuam privados e em qual momento poderão ser compartilhados.

## Linguagem visual

- Moderna, acolhedora e profissional, com aparência de marketplace de serviços.
- Hierarquia construída primeiro com tipografia, espaçamento e contraste.
- Cards reservados a entidades ou agrupamentos que precisam ser percebidos como
  uma unidade, como profissional, oportunidade, proposta ou contrato.
- Bordas, sombras e gradientes discretos; animações curtas e funcionais.
- Lucide React é a fonte única de ícones. Ações não universais combinam ícone e
  texto; botões apenas com ícone sempre recebem nome acessível.
- Fotos e portfólios devem receber espaço adequado quando houver dados reais,
  sem usar imagens decorativas como substituto de informação.

## Padrões por contexto

| Contexto | Informação prioritária | Ação principal |
| --- | --- | --- |
| Descoberta de profissionais | Foto, nome, especialidade, avaliação, área atendida e resumo de experiência | `Solicitar orçamento` |
| Oportunidades | Tipo de serviço, localização aproximada, prazo e orçamento quando informado | `Ver serviço` ou `Enviar proposta` |
| Propostas | Preço, prazo, disponibilidade, reputação e histórico comparáveis na mesma superfície | Ação definida pelo estágio da proposta |
| Contratação e pagamento | Resumo do acordo e status confirmado pelo backend/provedor | Ação financeira explícita |
| Chat | Conversa em primeiro plano, com contexto compacto do serviço ou contrato | Enviar mensagem |

Nunca apresentar contratação ou pagamento como confirmado antes da resposta da
fonte responsável. Diferenças relevantes entre propostas não devem ficar
escondidas em modais.

## Estados e mensagens

- **Loading:** manter a estrutura da tela sempre que possível, usar skeletons e
  bloquear reenvios enquanto a operação estiver em andamento.
- **Empty:** explicar por que não há conteúdo e oferecer a próxima ação útil.
- **Error:** informar o que falhou, preservar dados preenchidos e oferecer uma
  recuperação possível.
- **Success:** confirmar o resultado sem interromper desnecessariamente o fluxo.
- **Disabled:** usar semântica nativa, aparência indisponível e nenhum hover que
  sugira interação.
- **Offline:** informar limitações e indicar quando os dados podem estar
  desatualizados.

## Navegação interna e headers persistentes

- Seções navegáveis recebem um `id` estável e sem dependência do texto exibido.
- O deslocamento do header é responsabilidade dos tokens globais de
  `scroll-padding` e `scroll-margin`, não de margens específicas por página.
- Navegações por hash no router devem passar pelo comportamento compartilhado de
  âncoras para funcionar também quando a página de destino for carregada sob
  demanda.
- A seção de destino precisa começar abaixo do header em mobile e desktop,
  inclusive quando o usuário acessa diretamente uma URL com hash.

## Formulários

- Agrupar campos relacionados e usar label persistente.
- Usar tipo de input e teclado mobile adequados ao dado solicitado.
- Exibir erro junto ao campo e associá-lo com `aria-describedby`.
- Não limpar dados válidos após falha de rede, upload ou serviço externo.
- Validar no momento que ajude o usuário, sem interromper digitação cedo demais.
- Adotar React Hook Form e Zod quando a complexidade real do formulário
  justificar; formulários simples não devem ganhar dependências sem necessidade.

## Checklist de entrega de frontend

- [ ] A tarefa principal é evidente em mobile e desktop.
- [ ] Existe no máximo uma ação primária por contexto.
- [ ] Conteúdo essencial aparece antes de detalhes secundários.
- [ ] Loading, empty, error, success, disabled e offline foram considerados onde
      forem relevantes.
- [ ] Dados privados têm explicação contextual quando aparecem no fluxo.
- [ ] Navegação, foco, labels e leitura por tecnologia assistiva foram verificados.
- [ ] A interface funciona a partir de 320 px e não cria overflow horizontal.
- [ ] Temas Claro, Escuro e Sistema preservam hierarquia e contraste.
- [ ] Dependências novas têm justificativa técnica ou de UX e não duplicam uma
      solução existente.
- [ ] Lint, testes, build e verificação visual foram executados.

## O que evitar

- Transformar toda informação em card ou toda tela em dashboard.
- Blocos longos de texto em telas operacionais.
- Modais para tarefas que precisam de comparação ou contexto contínuo.
- Animações decorativas longas, sombras fortes e gradientes gratuitos.
- Interfaces desktop apenas reduzidas para caber no celular.
- Componentes complexos próprios quando uma primitive acessível existente atende.
- Antecipar fluxos ou regras de negócio para preencher uma composição visual.
