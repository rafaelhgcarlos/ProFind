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

O repository grava nome e perfil privado no mesmo batch. Na primeira gravação,
cria `clientProfiles/{uid}`; nas seguintes, atualiza o mesmo documento sem criar
outro usuário nem alterar papel ou modo.

O service deriva a prontidão no momento da leitura:

```ts
{ isComplete, missingFields }
```

No escopo da issue #44, o perfil está pronto quando o nome é válido e o
documento `clientProfiles/{uid}` existe. Telefone e foto são opcionais. Não há
campo `profileComplete` persistido ou editável.

Depois do onboarding ou da troca para Cliente, a prontidão define o destino:

- incompleto: `/cliente/perfil`;
- completo: `/cliente`.

Esse redirecionamento ocorre somente na transição. A navegação posterior não é
bloqueada: áreas permitidas continuam acessíveis e o `ClientLayout` mostra um
aviso persistente com link para completar o perfil.

## Foto

A foto usa a finalidade `CLIENT_AVATAR` no `ImageProvider`. Tipo e tamanho são
validados antes do upload; a tela oferece preview, progresso, erro e retry sem
limpar os demais campos. O Firestore recebe apenas URL HTTPS, identificador do
provedor, proprietário, finalidade e timestamps numéricos.

Com o adapter ImageKit, `clientProfiles/{uid}.profileImage` inclui
`provider: IMAGEKIT` e o `fileId`; arquivo, token e credenciais nunca entram no
Firestore.

A referência anterior só é removida do provedor depois que a nova referência
foi persistida. Assim, uma falha ao salvar não deixa o Firestore apontando para
uma imagem que já foi removida.

O carregamento começa pela identidade `users/{uid}` e, no modo Cliente, combina
os dados privados de `clientProfiles/{uid}` no estado da sessão. A imagem não é
duplicada em `users`: isso preserva a modelagem da #44, na qual referências
específicas do cliente pertencem a `clientProfiles`. Após salvar, o formulário e
o contexto recebem a mesma `ImageReference`; em um novo login, o repository a
reconstrói com timestamps numéricos e o header volta a usar sua URL HTTPS.

## Limites

Endereço do cliente, dados de pedido e exposição de informações a profissionais
pertencem às issues posteriores. Esta entrega não cria perfil público de cliente
nem antecipa as issues #45, #46 ou #47.
