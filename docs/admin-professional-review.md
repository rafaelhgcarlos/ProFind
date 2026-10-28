# Análise administrativa de profissionais

## Entrega

A área `/admin/profissionais` usa a autorização administrativa existente e trabalha diretamente com o autocadastro do profissional. A fila permite filtrar estado da análise e ativação, abrir o cadastro, conferir a versão enviada, foto, portfólio, histórico público, notas internas e atendimentos ainda confirmados.

As decisões reutilizam as transações do domínio de análise. Toda ação informa a versão e a revisão lidas; uma edição concorrente interrompe a decisão e obriga a releitura. Aprovação pode ativar o cadastro na mesma transação. Solicitação de ajustes, rejeição, suspensão, desativação e reativação seguem as transições existentes.

O auxílio administrativo altera somente nome público, apresentação, descrição e experiência. Ele exige confirmação explícita e nota interna, incrementa a versão, registra autoria administrativa e nunca acessa a sessão do profissional. Foto e portfólio permanecem isolados pelo proprietário e pelo fluxo ImageKit/Worker existente.

## Roteiro manual

Use contas distintas e dados demonstrativos no Firebase Emulator Suite:

1. Entre como profissional, conclua o cadastro e envie para análise.
2. Entre como administrador ativo e abra **Administração > Análise**.
3. Filtre por **Em análise** e **Inativos**; confirme que o cadastro aparece e que a paginação mantém os filtros.
4. Abra o cadastro e confira dados, versão enviada, foto, portfólio e histórico.
5. Solicite ajustes preenchendo o retorno ao profissional e uma nota interna diferente.
6. Volte à conta profissional, confira somente o retorno permitido, corrija o cadastro e reenvie.
7. Mantenha a tela administrativa antiga aberta e tente decidir: a versão antiga deve ser recusada e a tela deve exigir releitura.
8. Reabra o cadastro, aprove a versão atual com **Ativar ao aprovar** marcado e confirme a liberação operacional.
9. Crie um atendimento confirmado demonstrativo no emulador para esse profissional.
10. Suspenda o profissional; confirme o aviso de atendimento, o bloqueio de novas oportunidades e a preservação do atendimento e do histórico.
11. Confirme que uma conta comum não acessa a fila e que o profissional não lê notas internas nem consegue se aprovar, ativar ou remover a suspensão.
12. Em um rascunho, use **Auxiliar no preenchimento**, confirme a ação e verifique a nova versão, autoria e nota privada.

## Pendências e limites

- A intervenção sobre atendimentos confirmados continua no escopo da #34; esta entrega apenas avisa e preserva os registros.
- Não há gestão de senhas, contas do Firebase Authentication ou documentos reais.
- Os índices adicionados precisam acompanhar as Rules quando a publicação for autorizada. Nenhum deploy faz parte desta entrega.
- A validação hospedada deve ser realizada separadamente com contas de teste. Os testes automatizados usam o emulador e não comprovam operações em produção.
