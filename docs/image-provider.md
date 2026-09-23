# Provedor de imagens

Fotos de cliente, perfil profissional e portfólio usam a interface
`ImageProvider`. As features conhecem apenas esse contrato e o service de
imagens; não importam SDK de armazenamento. Firebase Storage não é usado.

## Seleção do adapter

A factory `src/providers/image-provider.factory.ts` oferece:

- `VITE_IMAGE_PROVIDER=imagekit`: integração real com ImageKit;
- `VITE_IMAGE_PROVIDER=mock`: test double, somente para testes ou fallback
  selecionado explicitamente;
- `VITE_IMAGE_PROVIDER=backend`: cliente HTTP genérico preservado para outro
  backend seguro;
- `VITE_IMAGE_PROVIDER=disabled`: desabilita uploads sem impedir a edição dos
  demais campos.

Quando as três variáveis públicas do ImageKit estão presentes, a factory escolhe
`imagekit` automaticamente. Sem configuração, uploads ficam desabilitados; o
desenvolvimento não cai silenciosamente no mock nem persiste URLs sintéticas. O
mock é recusado em produção.

Nenhuma chave secreta pode usar o prefixo `VITE_`: essas variáveis são
incorporadas ao JavaScript entregue ao navegador.

## ImageKit e Upload API V2

O `ImageKitImageProvider` usa a Upload API V2, que autentica um JWT HS256 sobre
todo o payload, em vez do fluxo V1 limitado a `token`, `signature` e `expire`.
O Worker monta e assina `fileName`, `folder`, `useUniqueFileName`, `checks` e
`transformation`; o navegador acrescenta somente o arquivo e o token ao
`multipart/form-data`. Cada credencial é única, expira em cinco minutos e nunca
contém a private key.

O SDK oficial `@imagekit/nodejs` é usado no Worker para a API de administração e
remoção. A versão atual do SDK oficial de navegador ainda expõe upload V1; por
isso o adapter envia o formulário diretamente ao endpoint V2 oficial. `jose` é
usado para validar Firebase ID Tokens e gerar o JWT V2 conforme o contrato
oficial do ImageKit.

O Worker valida o Firebase ID Token pelo JWKS do Google, exige `aud` igual ao
projeto e `iss` do Firebase Secure Token, e obtém o UID exclusivamente de `sub`.
O `ownerId` eventualmente enviado pelo cliente é ignorado. CORS aceita localhost
e a lista explícita de `ALLOWED_ORIGINS`.

## Configuração local

As variáveis públicas do frontend são:

```dotenv
VITE_IMAGE_PROVIDER=imagekit
VITE_IMAGEKIT_PUBLIC_KEY=...
VITE_IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/...
VITE_IMAGEKIT_AUTH_ENDPOINT=http://localhost:8787/api/imagekit/auth
```

Copie `worker/.dev.vars.example` para `worker/.dev.vars`, ignorado pelo Git, e
preencha localmente `IMAGEKIT_PRIVATE_KEY` e `IMAGEKIT_PUBLIC_KEY`. Não use
`VITE_` na chave privada. O comando de desenvolvimento inicia frontend e Worker
juntos:

```sh
npm run dev
```

Para depurar somente uma das partes, use `npm run dev:web` ou
`npm run worker:dev`. Com `VITE_IMAGEKIT_AUTH_ENDPOINT` apontando para
`localhost:8787`, executar apenas `dev:web` deixa uploads indisponíveis.
Em desenvolvimento, esse endpoint local é convertido para `/api/imagekit` e o
proxy do Vite encaminha a requisição para `127.0.0.1:8787`; isso evita diferenças
de resolução IPv4/IPv6 de `localhost` no navegador.
O watcher do frontend ignora `worker/.wrangler`, pois o runtime local atualiza
esse diretório a cada requisição e essas escritas não podem recarregar o
formulário aberto.

## Cloudflare Pages e Worker em produção

O arquivo `.env` local não participa do build do Cloudflare Pages. No ambiente
**Production** do projeto Pages, configure antes do build:

```dotenv
VITE_IMAGE_PROVIDER=imagekit
VITE_IMAGEKIT_PUBLIC_KEY=public_...
VITE_IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/...
VITE_IMAGEKIT_AUTH_ENDPOINT=https://profind-imagekit.<account-subdomain>.workers.dev/api/imagekit/auth
```

`VITE_IMAGEKIT_AUTH_ENDPOINT` nunca pode apontar para localhost em produção.
Como variáveis `VITE_*` são incorporadas no build, alterar o dashboard exige um
novo deployment do Pages.

No Worker, `FIREBASE_PROJECT_ID` e `ALLOWED_ORIGINS` ficam como vars. A origem
`https://profind.pages.dev` já está autorizada em `worker/wrangler.jsonc`.
Configure `IMAGEKIT_PUBLIC_KEY` como variável do Worker e cadastre a private key
manualmente com:

```sh
npx wrangler secret put IMAGEKIT_PRIVATE_KEY --config worker/wrangler.jsonc
```

Depois publique o Worker com `npx wrangler deploy --config
worker/wrangler.jsonc`, copie a URL HTTPS retornada para a variável do Pages e
refaça seu deployment. Nenhum valor `IMAGEKIT_PRIVATE_KEY` deve ser cadastrado
no Pages ou em variável `VITE_*`.

Para rotacionar a chave, crie uma nova private key no ImageKit, atualize o secret
do Worker com o mesmo comando, valide upload e remoção e somente então revogue a
chave anterior. Nunca registre a chave em logs, Firestore ou arquivos
versionados.

## Finalidade, pastas e isolamento

Toda operação usa uma finalidade da união discriminada `ImagePurpose`:

- `CLIENT_AVATAR`: avatar do contexto Cliente;
- `PROFESSIONAL_AVATAR`: foto do perfil profissional;
- `PROFESSIONAL_PORTFOLIO`: trabalho do portfólio profissional.

As pastas são determinadas pelo Worker a partir do UID validado:

- `/profind/users/{uid}/client-avatar`;
- `/profind/professionals/{uid}/avatar`;
- `/profind/professionals/{uid}/portfolio`.

A referência registra `provider`, `ownerId` e `purpose`. Uma URL de portfólio
nunca é promovida a avatar. Assim, uma conta com os dois papéis mantém avatares
independentes.

## Validação, transformação e persistência

Frontend e Worker aceitam JPEG, PNG ou WebP e limitam cada arquivo a 5 MB. O
portfólio mantém o limite existente de três imagens. Cada item conserva preview,
progresso, erro e retry independentes sem limpar os outros dados do formulário.

O payload assinado também contém checks de tipo e tamanho. Avatares recebem
pré-transformação com orientação automática, WebP, qualidade 80 e limite
aproximado de 512 × 512. Portfólio usa WebP otimizado e limite maior.

O preview usa `blob:` somente enquanto o arquivo local aguarda upload ou retry.
Assim que o provider retorna, o preview é revogado e a interface renderiza a URL
HTTPS real. `blob:`, data URL, `providerId` vazio, provider incompatível e
timestamps inválidos são recusados antes do repository.

O Firestore recebe somente:

```ts
{
  provider: 'IMAGEKIT'
  ownerId: string
  purpose: ImagePurpose
  url: string
  providerId: string // fileId do ImageKit
  createdAt: number
  updatedAt: number
}
```

As referências profissionais acrescentam `order` e `altText`. Arquivos, `Blob`,
`File`, data URL, base64, tokens e secrets nunca são persistidos. As Firestore
Rules aceitam somente providers persistíveis, URL HTTPS e o mapa mínimo esperado.

Depois de salvar, o formulário atualiza seu estado-base e o contexto da sessão
com a mesma referência. O formulário e o header usam a URL real imediatamente;
repository e converter restauram a referência em remount, refresh e novo login.

## Substituição e remoção

Na substituição, a referência antiga permanece vigente até o upload e a
persistência da nova terminarem. Enquanto a antiga ainda está persistida, o
Worker valida UID, finalidade e `providerId` e emite um grant curto de remoção.
Após salvar a nova referência, esse grant autoriza apagar somente o arquivo
anterior. Uma falha de limpeza preserva a nova referência e permite retry sem
desfazer a imagem já salva.

Remoções comuns relêem a referência pelo Firestore REST com o Firebase ID Token
do próprio usuário. O Worker só chama `files.delete(fileId)` quando a referência
persistida tem `provider: IMAGEKIT`, o mesmo UID, finalidade e `providerId`. O
frontend não consegue escolher outro proprietário.

## Adapter backend genérico

O adapter `backend` preservado espera:

- `POST {baseUrl}/images` em `multipart/form-data`;
- `DELETE {baseUrl}/images/{providerId}`.

Um backend desse tipo deve repetir autenticação e validações. A integração
ImageKit não usa esse contrato genérico.

## Limites e custos

Em 23/09/2026, o plano Forever Free publicado pelo ImageKit inclui 20 GB de
bandwidth mensal e 3 GB de armazenamento DAM. O provedor informa limite de 25 MB
por imagem no plano gratuito, mas o ProFind impõe 5 MB antes do envio e no check
assinado. Os limites comerciais podem mudar; consulte a página oficial de planos
antes da produção.

## Encerramento da conta

A #47 continuará responsável por orquestrar exclusão global e limpeza de órfãos.
Ela deverá coletar as referências de `clientProfiles/{uid}` e
`professionalProfiles/{uid}`, agrupá-las por finalidade e executar retry
idempotente. Esta integração não antecipa esse fluxo.

## Verificação

Execute:

```sh
npm test
npm run test:worker
npm run test:rules
npm run typecheck
npm run lint
npm run build
npm run audit:bundle-secrets
git diff --check
```

O adapter `mock` não armazena arquivos e sua URL sintética não representa mídia
durável. Com `imagekit`, somente uma resposta HTTPS no endpoint configurado,
`fileId` não vazio e `provider: IMAGEKIT` tornam-se persistíveis.
