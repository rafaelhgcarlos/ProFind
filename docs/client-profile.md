# Perfil privado do cliente

A rota protegida `/cliente/perfil` cria e edita o perfil básico usado no modo
Cliente. Ela exige uma conta autenticada com o papel `client` e reutiliza o
`ClientLayout`, o design system e o `ImageProvider` configurado pela aplicação.

## Modelo de dados

`users/{uid}` continua sendo a identidade canônica da conta. O documento guarda
nome, e-mail, papéis e modo ativo. A tela pode alterar somente `name`; não edita
e-mail, senha, papéis ou modo.

`clientProfiles/{uid}` é privado e contém somente:

- `ownerId`, imutável e igual ao UID;
- `phone`, opcional e normalizado para 10 ou 11 dígitos;
- `profileImage`, nulo ou metadados mínimos de `CLIENT_AVATAR`;
- `createdAt` e `updatedAt` controlados pelo servidor.

O documento não duplica e-mail ou nome e não aceita endereço, CPF, RG, data de
nascimento, base64 ou arquivo bruto. As Rules permitem leitura e escrita apenas
ao proprietário autenticado com papel Cliente. Um backend com Admin SDK pode
atuar fora dessas Rules quando houver uma finalidade autorizada.

## Criação, edição e prontidão

O repository grava nome e perfil privado na mesma transação. A existência do
documento é confirmada dentro da transação: na primeira gravação, cria
`clientProfiles/{uid}`; nas seguintes, atualiza o mesmo documento sem recriar a
identidade nem substituir `createdAt`. Isso também torna segura uma nova
tentativa depois de uma resposta de rede ambígua.

O service deriva a prontidão no momento da leitura:

```ts
{ isComplete, missingFields }
```

No escopo vigente da issue #44 e do plano #50, o perfil está pronto quando o
nome é válido e o documento `clientProfiles/{uid}` existe. Telefone e foto são
opcionais. CNPJ, documentos e endereço não participam dessa prontidão. Não há
campo `profileComplete` persistido ou editável.

Depois do onboarding ou da troca para Cliente, a prontidão define o destino:

- incompleto: `/cliente/perfil`;
- completo: `/cliente`.

Esse redirecionamento ocorre somente na transição. A navegação posterior não é
bloqueada: áreas permitidas continuam acessíveis e o `ClientLayout` mostra um
aviso persistente com link para completar o perfil.

Contas legadas que já têm papéis, mas perderam um `activeMode` válido, são
normalizadas de forma idempotente antes do roteamento (Cliente é o modo inicial
de uma conta com ambos os papéis). Se ainda não há papéis, um modo órfão antigo
não impede o primeiro onboarding de gravar a escolha atual. Assim, o login não
alterna indefinidamente entre `/onboarding` e uma área autenticada.

## Foto

A foto usa a finalidade `CLIENT_AVATAR` no `ImageProvider`. Tipo e tamanho são
validados antes do upload; a tela oferece preview, progresso, erro e retry sem
limpar os demais campos. O Firestore recebe apenas URL HTTPS, identificador do
provedor, proprietário, finalidade e timestamps numéricos.

Com o adapter ImageKit, `clientProfiles/{uid}.profileImage` inclui
`provider: IMAGEKIT` e o identificador do provedor; arquivo, token e credenciais
nunca entram no Firestore.

Referências legadas sem o campo `provider` continuam legíveis. As Rules deixam
que uma referência legada válida permaneça inalterada enquanto nome ou telefone
são salvos, mas não permitem criar uma nova referência nesse formato nem trocar
seu identificador. O cliente pode removê-la ou substituí-la por metadados atuais.

A referência anterior só é removida do provedor depois que a nova referência
foi persistida. Assim, uma falha ao salvar não deixa o Firestore apontando para
uma imagem que já foi removida.

`CLIENT_AVATAR` permanece isolado de `PROFESSIONAL_AVATAR` e do portfólio.
Alterar o perfil privado do cliente não escreve no perfil operacional
profissional, não muda a versão analisada e não revoga uma aprovação existente.

O carregamento começa pela identidade `users/{uid}` e, no modo Cliente, combina
os dados privados de `clientProfiles/{uid}` no estado da sessão. A imagem não é
duplicada em `users`: isso preserva a modelagem da #44, na qual referências
específicas do cliente pertencem a `clientProfiles`. Após salvar, o formulário e
o contexto recebem a mesma `ImageReference`; em um novo login, o repository a
reconstrói com timestamps numéricos e o header volta a usar sua URL HTTPS.

## Limites

Endereço do atendimento pertence à solicitação de serviço, não ao perfil.
O perfil não é público e não coleta documentos ou CNPJ.
