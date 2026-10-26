# Acesso administrativo

A área `/admin` usa o Firebase Authentication apenas para identificar a sessão. A autorização vem exclusivamente do documento protegido `adminAccess/{uid}` no Cloud Firestore, em que o ID do documento deve ser exatamente o UID da conta autenticada.

## Estrutura da credencial

```text
adminAccess/{uid}
  active: boolean
  schemaVersion: number       // valor aceito atualmente: 1
  provisionedAt: timestamp
  provisionedBy: string       // identificação operacional, sem senha ou segredo
```

Somente `active: true` com `schemaVersion: 1` libera a rota. Documento ausente, inativo, malformado ou erro de leitura nega o acesso. A aplicação observa o documento em tempo real, portanto uma revogação substitui o painel pelo estado de acesso negado sem depender de recarregar a página.

As Security Rules permitem que uma conta autenticada leia somente `adminAccess/{seu próprio uid}`. Elas negam `list`, `create`, `update` e `delete` para todo cliente web, inclusive para um administrador já autorizado. Não existe formulário, repository ou service de escrita dessa credencial no frontend. Os campos `roles` e `activeMode` de `users/{uid}` continuam limitados a `client` e `professional` e não concedem acesso administrativo.

O namespace `adminData/{document=**}` fica reservado para dados operacionais administrativos das próximas entregas. Ele exige uma credencial ativa para leitura e não aceita escrita de clientes web. Nesta entrega não há documentos, números ou operações simuladas nesse namespace.

## Provisionar o primeiro administrador

Faça o bootstrap em um projeto de desenvolvimento antes de repetir o procedimento no ambiente correto. Esta tarefa não publica Rules nem altera produção.

1. No Firebase Console, abra **Authentication > Users**.
2. Crie a conta administrativa por e-mail/senha ou localize uma conta já criada e validada pelo responsável.
3. Copie o **User UID** exibido pelo Authentication. Não use o e-mail como ID ou como fonte de autorização.
4. Abra **Firestore Database > Data** e crie a coleção `adminAccess`.
5. Crie um documento cujo ID seja exatamente o UID copiado.
6. Adicione os campos:
   - `active` como boolean `true`;
   - `schemaVersion` como number `1`;
   - `provisionedAt` como timestamp com o instante do provisionamento;
   - `provisionedBy` como string que identifique o responsável ou processo, por exemplo `bootstrap:firebase-console`.
7. Entre na aplicação com essa conta e acesse `/admin` diretamente.

O Console é um ambiente administrativo confiável e não usa as credenciais do frontend para gravar o documento. Restrinja o acesso IAM ao projeto; qualquer pessoa com permissão de escrita no Console pode provisionar ou revogar administradores.

## Revogar acesso

No Firebase Console, abra `adminAccess/{uid}` e escolha uma destas opções:

- altere `active` para `false` para manter o registro operacional; ou
- exclua o documento para remover a credencial.

A assinatura ativa da página recebe a mudança e bloqueia o painel. Para encerrar também a sessão geral do usuário, desative a conta separadamente em **Authentication > Users**. Revogar a credencial administrativa não remove os papéis legítimos de cliente/profissional nem desativa a conta.

## Teste local com duas contas

1. Configure `.env.development.local` para um projeto Firebase de desenvolvimento com Authentication por e-mail/senha e as Rules desta branch aplicadas nesse projeto de teste.
2. Em **Authentication > Users**, crie duas contas distintas: uma administrativa e uma comum.
3. Provisione apenas o UID da conta administrativa em `adminAccess`, usando a estrutura acima.
4. Execute `npm run dev` e abra `/admin` após entrar com a conta administrativa; a estrutura do painel deve aparecer.
5. Saia e entre com a conta comum. O acesso direto a `/admin` deve mostrar acesso negado, sem renderizar o painel.
6. Com a conta administrativa novamente aberta em `/admin`, altere `active` para `false` no Console. A tela deve mudar para acesso negado.
7. Reative somente pelo Console para repetir o teste. Tentativas de `set`, `update` ou `delete` pelo SDK web devem retornar `permission-denied`.

Para validar as regras sem tocar em um projeto remoto, execute `npm run test:rules`; a suíte inicia o emulador, semeia as credenciais com as Rules desabilitadas no contexto administrativo de teste e verifica os acessos como admin, usuário comum e visitante.

## Limites desta entrega

- Não há gerenciamento de administradores no painel; provisionamento e revogação são manuais.
- A análise de profissionais pertence à issue #32.
- O acompanhamento operacional pertence à issue #34.
- O catálogo existente foi preservado, mas sua manutenção administrativa não foi adicionada.
- Não há Admin SDK, service account, Firebase Storage, Cloud Function obrigatória ou novo backend no frontend.
