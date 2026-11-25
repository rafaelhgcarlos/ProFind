# Issue #54 — preparação, publicação e rollback

Este runbook prepara a publicação do fluxo definido na #50 e validado localmente
pela #39. Ele não autoriza deploy, criação de contas, seed remoto, alteração de
domínios ou fechamento da issue.

## Decisões e recursos

| Recurso | Identificador | Responsabilidade |
| --- | --- | --- |
| Cloudflare Pages | projeto `profind`, `https://profind.pages.dev` | frontend Vite/SPA em `dist` |
| Cloudflare Worker | `profind-imagekit` | autenticação e remoção ImageKit por UID/finalidade |
| Firebase | projeto `profind-42bf7` | Authentication e Cloud Firestore |
| Firebase Auth | `profind-42bf7.firebaseapp.com` | e-mail/senha e sessão do cliente |
| ImageKit | endpoint público configurado em `VITE_IMAGEKIT_URL_ENDPOINT` | mídia persistente |

O painel do Pages define o build do frontend, as variáveis `VITE_*` e a saída
`dist`. Mantenha a raiz do repositório sem uma configuração Wrangler para o
Pages. No deploy de 24/11/2026, o arquivo na raiz fez o build ignorar as
variáveis cadastradas no painel. O gate do bundle exige `index.html` na raiz e
a ausência de `404.html` para ativar o fallback SPA nativo. O Worker usa
`worker/wrangler.jsonc`, com `keep_vars: true` para preservar sua configuração.

## Estado verificado em 23/11/2026

- `.env` local, o Worker versionado e o acesso do Firebase CLI concordam com o
  projeto `profind-42bf7`.
- `ALLOWED_ORIGINS` contém exatamente `https://profind.pages.dev` além das
  origens locais de desenvolvimento.
- O `.env` local aponta o auth do ImageKit para `localhost`; ele serve somente ao
  desenvolvimento e não é configuração válida para um build hospedado.
- O acesso Cloudflare via CLI não pôde ser consultado neste ambiente porque não
  há `CLOUDFLARE_API_TOKEN`. Por isso a URL efetiva do Worker, as variáveis do
  Pages e os deployments atuais continuam como verificações externas.
- A leitura do projeto Firebase confirmou `profind-42bf7`. A leitura dos índices
  publicados encontrou todos os índices versionados, exceto
  `serviceRequests(clientId ASC, status ASC)`. Esse índice deve ser publicado e
  chegar a `READY` antes do frontend.
- O domínio autorizado do Firebase Authentication não é exposto pelo CLI usado
  aqui. `profind.pages.dev` deve ser conferido no Console antes do deploy.

## Variáveis por ambiente

### Cloudflare Pages — Production

Configure no dashboard, sem copiar `.env` local:

```dotenv
VITE_APP_NAME=ProFind
VITE_FIREBASE_API_KEY=<configuração pública do app web profind-42bf7>
VITE_FIREBASE_AUTH_DOMAIN=profind-42bf7.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=profind-42bf7
VITE_FIREBASE_APP_ID=<configuração pública do app web>
VITE_FIREBASE_MESSAGING_SENDER_ID=<configuração pública do app web>
VITE_IMAGE_PROVIDER=imagekit
VITE_IMAGEKIT_PUBLIC_KEY=<chave pública>
VITE_IMAGEKIT_URL_ENDPOINT=<endpoint HTTPS do ImageKit>
VITE_IMAGEKIT_AUTH_ENDPOINT=https://<worker-publicado>/api/imagekit/auth
VITE_SUPPORT_WHATSAPP_NUMBER=<canal oficial com DDI e DDD>
```

O endpoint do Worker deve ser HTTPS, responder pelo caminho
`/api/imagekit/auth` e nunca conter `localhost`. Variáveis `VITE_*` são públicas
e entram no JavaScript; não cadastrar nelas private key, service account,
Admin SDK, token de CI ou client secret.

Configuração de build do Pages:

- branch de produção: `main`;
- versão Node: 22 ou superior;
- comando: `if [ "$CF_PAGES_BRANCH" = "main" ]; then npm run build:release; else npm run build; fi`;
- diretório de saída: `dist`;
- diretório raiz: raiz do repositório.

### Cloudflare Worker

Variáveis não secretas:

- `FIREBASE_PROJECT_ID=profind-42bf7`;
- `ALLOWED_ORIGINS=https://profind.pages.dev,...`;
- `IMAGEKIT_PUBLIC_KEY`, já cadastrada no ambiente do Worker.

Segredo exclusivo do Worker:

- `IMAGEKIT_PRIVATE_KEY`.

O frontend nunca recebe a private key. Antes da publicação autorizada, use uma
credencial Cloudflare de escopo mínimo e confirme sem imprimir valores:

```bash
npx wrangler versions list --config worker/wrangler.jsonc
npx wrangler secret list --config worker/wrangler.jsonc
```

Se o secret ainda não existir, sua criação é uma ação remota separada e exige
autorização explícita:

```bash
npx wrangler secret put IMAGEKIT_PRIVATE_KEY --config worker/wrangler.jsonc
```

### Firebase Authentication

No Console do projeto `profind-42bf7`, abra **Authentication > Settings >
Authorized domains** e confira `profind.pages.dev` sem protocolo ou caminho.
Cadastre domínios de preview somente quando forem realmente usados; não use um
domínio amplo para contornar a validação. Confirme também o provedor
E-mail/senha.

## Gate local obrigatório

Use Node 22+, npm 10+ e JDK 21+. Se o Windows ainda resolver Java 8, selecione o
JDK moderno apenas no processo antes dos testes do emulador.

```bash
npm ci
npm run typecheck
npm run lint
npm test -- --run
npm run test:ui:regression
npm run test:worker
npm run test:concurrency:emulator
npm run test:rules
npm run build:release
git diff --check
```

`build:release` falha antes do build quando o ambiente Production aponta ao
projeto errado, usa mock/localhost, omite o canal de suporte ou expõe uma
variável de segredo. Depois do build, ele verifica que o endpoint HTTPS esperado
e `profind-42bf7` foram incorporados e executa a auditoria de segredos.

Não existe hoje uma suíte Playwright/Cypress em navegador real. Os testes UI
usam jsdom; mobile/desktop, zoom, menus após rolagem e upload real pertencem ao
gate manual hospedado, não podem ser marcados como aprovados pelos testes locais.

## Rules e índices

Arquivos autoritativos:

- `firestore.rules`;
- `firestore.indexes.json`.

A publicação deve usar sempre `--project profind-42bf7`. Nunca dependa do projeto
ativo global do CLI. Publique primeiro os índices, pois sua construção é
aditiva e pode ser assíncrona:

```bash
firebase deploy --only firestore:indexes --project profind-42bf7
firebase firestore:indexes --project profind-42bf7
```

No Console, aguarde todos os índices em `READY`, em especial
`serviceRequests(clientId ASC, status ASC)`. Só então publique as Rules:

```bash
firebase deploy --only firestore:rules --project profind-42bf7
```

Rules novas devem aceitar o frontend atualmente hospedado e o novo frontend
durante toda a janela. Se uma alteração não for compatível nas duas direções,
prepare primeiro uma Rule transitória compatível; não tente sincronizar dois
deploys quebráveis por relógio. Índices antigos e ainda usados não devem ser
removidos na mesma janela.

## Ordem de implantação após autorização

1. Registre commit, responsável, horário, deployment atual do Pages, versão
   atual do Worker e snapshot Git anterior das Rules/índices.
2. Confirme os domínios Auth, as variáveis Production do Pages e as variáveis e
   secrets do Worker sem exibir valores.
3. Execute todo o gate local com a configuração Production efetiva.
4. Publique somente os índices Firestore e aguarde `READY`.
5. Publique as Rules compatíveis e faça smoke test de leitura/login no frontend
   ainda vigente.
6. Publique o Worker e guarde o version ID:

   ```bash
   npx wrangler deploy --config worker/wrangler.jsonc
   ```

7. Verifique `OPTIONS`/autenticação do Worker a partir de
   `https://profind.pages.dev`; uma requisição sem token deve falhar de forma
   controlada, nunca liberar upload.
8. Gere `dist` novamente com o endpoint HTTPS publicado e execute
   `npm run build:release`.
9. Publique o Pages pelo fluxo Git configurado ou, se o procedimento autorizado
   for CLI, pelo artefato já auditado:

   ```bash
   npx wrangler pages deploy dist --project-name=profind --branch=main
   ```

10. Execute smoke tests de rotas/sessão e depois o roteiro multiusuário completo.
    Não feche a #54 antes das evidências entre contas/dispositivos e do upload
    real.

## Rotas, recarga e sessão

Em uma janela limpa, valide acesso direto e recarga (`Ctrl+R`) em:

| Tipo | Rotas mínimas | Resultado |
| --- | --- | --- |
| pública | `/`, `/cadastro`, `/entrar`, `/recuperar-senha`, `/termos-de-uso`, `/politica-de-privacidade` | HTTP 200, aplicação renderiza sem 404 do Pages |
| cliente | `/cliente`, `/cliente/perfil`, `/cliente/solicitar`, `/cliente/pedidos/{id}` | mantém sessão e dados próprios |
| profissional | `/profissional`, `/profissional/perfil`, `/profissional/analise`, `/profissional/oportunidades/{id}`, `/profissional/atendimentos/{id}` | respeita estado operacional e privacidade |
| admin | `/admin`, `/admin/profissionais`, `/admin/pedidos`, `/admin/pendencias`, `/admin/relatos` | exige `adminAccess/{uid}` ativo |

Para sessão expirada, revogue/desative somente uma conta demonstrativa ou expire
sua sessão pelo procedimento de teste, recarregue uma rota protegida e confirme:

- redirecionamento para `/entrar` com aviso, sem tela quebrada;
- destino original preservado para retorno após novo login;
- nenhuma rota protegida ou dado privado permanece renderizado;
- rotas públicas continuam disponíveis;
- login e edição de campos sem imagem continuam funcionando se o Worker estiver
  indisponível.

## Dados demonstrativos idempotentes

Use um identificador de execução, por exemplo `demo-20261130-01`, e mantenha um
manifesto privado sem senhas. Não grave passwords, tokens ou private keys na
issue ou no repositório.

Contas distintas:

- administrador já provisionado pelo procedimento seguro de `admin-access.md`;
- cliente;
- profissionais A, B e C compatíveis;
- profissional D incompatível por especialidade ou município.

Procedimento:

1. Faça a prévia do catálogo. Ela só lê e não escreve:

   ```bash
   npm run seed:catalog -- --project=profind-42bf7 --dry-run
   ```

2. Se faltarem documentos, a execução sem `--dry-run`, depois de autorização,
   cria apenas ausentes e preserva existentes. Não use `--merge-existing` na
   demonstração.
3. Gere e-mails distintos sob um domínio controlado, incorporando o run ID.
   Se uma conta já existir, reutilize-a somente quando o manifesto provar que
   pertence ao mesmo run. Em colisão desconhecida, aborte e incremente o run ID.
4. Cliente e profissionais A/B/C/D devem concluir o autocadastro pela interface.
   Não pré-crie perfis aprovados nem escreva documentos para substituir essa
   parte do roteiro.
5. Use nomes, títulos e descrição contendo `DEMO <run-id>`, uma cidade conhecida
   e dados obviamente fictícios. Não use documentos reais.
6. A/B/C usam o mesmo matching e disponibilidade; D difere em um critério claro.
7. Escolha data e período realmente futuros dentro do horizonte da aplicação.
   Não altere relógio, `acceptUntil`, Rules ou disponibilidade para acelerar.
8. Em reexecução, retome os mesmos registros do manifesto. Não reenvie ações já
   confirmadas e use as chaves idempotentes da aplicação; se for necessária uma
   nova jornada completa, crie um novo run ID em vez de sobrescrever a anterior.

Nenhuma criação, seed, migração ou limpeza remota foi executada nesta preparação.

## Roteiro multiusuário hospedado

Use sessões isoladas (perfis de navegador ou dispositivos distintos). Não troque
usuários na mesma sessão para simular concorrência.

1. A faz autocadastro, salva perfil e envia para análise. Repita com B/C/D.
2. Admin solicita ajuste de A; A corrige e reenvia; admin aprova e ativa A/B/C.
   D pode ser aprovado, mas permanece incompatível com o pedido escolhido.
3. Antes da aprovação, confirme que cadastro pendente vê perfil/análise/ajuda,
   mas não oportunidades.
4. Cliente cria o pedido. A/B/C veem somente os detalhes pré-aceite permitidos;
   D não vê/não aceita. Confirme que endereço e contato privados são negados.
5. Dois profissionais aceitam quase simultaneamente em dispositivos separados.
   Não escolha nem force vencedor. Registre quem venceu: exatamente um pedido,
   uma atribuição ativa e uma reserva devem existir; o perdedor recebe conflito.
6. O vencedor cancela antes do início real. Confirme liberação da reserva, nova
   rodada, exclusão do cancelador nessa rodada e acompanhamento do cliente.
7. Outro profissional aceita. Confirme que o antigo responsável perdeu acesso
   ao documento privado e o novo ganhou acesso.
8. No horário real do período, o novo responsável inicia e conclui; o cliente
   acompanha as duas transições e o histórico permanece após recarga.
9. Em jornadas separadas e identificadas, cubra recusa por rodada,
   indisponibilidade do slot, cadastro pendente, suspensão, pedido sem aceite até
   o corte e relato manual de falta.
10. Após o limite de aceite, mantenha o pedido como pendência e use o fluxo
    administrativo existente. Não crie estado artificial nem afrouxe a Rule.

Ao final, confira pedido, rodadas, atribuições, reservas e eventos. Deve existir
uma única atribuição corrente coerente; a anterior fica cancelada, reservas
liberadas/concluídas correspondem ao histórico e eventos são imutáveis.

## ImageKit/Worker — prova hospedada

Mocks e emuladores validam contrato, não upload real. Em duas contas e
dispositivos distintos, registre rede e tela sem tokens:

- upload, visualização, recarga, substituição e remoção de `CLIENT_AVATAR`;
- as mesmas operações para `PROFESSIONAL_AVATAR` e
  `PROFESSIONAL_PORTFOLIO`;
- URL HTTPS e `provider: IMAGEKIT` persistidos, nunca `blob:`, base64 ou mock;
- owner UID e finalidade corretos; tentativa cruzada deve ser negada;
- mudança profissional persistida incrementa versão e aciona reanálise;
- avatar do cliente não altera análise profissional;
- falha de upload preserva a referência antiga;
- falha de persistência não apaga a imagem válida anterior;
- falha de limpeza mantém recuperação/retry sem bloquear login ou outros campos.

Não exponha Authorization, JWT, `fileId` completo se ele for tratado como dado
operacional, chave pública completa, private key ou conteúdo de documentos
privados nas capturas.

## Consultas, listeners e cotas

- oportunidades: páginas de no máximo 50 e listeners desmontados ao trocar de
  conta/filtro;
- pedidos do cliente: paginação/cursor, sem varrer a coleção;
- painel admin: 12 itens na UI, máximo 25 no repository; detalhes e históricos
  limitados a 50;
- eventos: 50 mais recentes;
- credencial admin e estados de sessão usam listeners pontuais, desmontados com
  a rota;
- não existe job obrigatório com o site fechado, push ou detecção automática de
  falta.

Durante a demonstração acompanhe Firebase Console **Usage**, leituras/escritas,
erros de índice e Authentication; no Cloudflare acompanhe Analytics do Pages e
invocações/erros do Worker; no ImageKit acompanhe armazenamento e bandwidth.
Defina alertas operacionais fora do frontend e revalide os limites dos planos
antes da produção.

## Rollback

Antes do deploy, registre IDs e commit anterior. Rollback não apaga dados nem
histórico criado durante a janela.

1. Interrompa novas demonstrações e registre o sintoma/horário.
2. Pages: no dashboard, promova novamente o deployment anterior conhecido. Faça
   smoke test de rotas e login.
3. Worker, se a falha for nele:

   ```bash
   npx wrangler rollback <version-id-anterior> --config worker/wrangler.jsonc
   ```

4. Rules: a partir de um worktree limpo no commit/tag anterior compatível,
   publique somente `firestore:rules` em `profind-42bf7`. Nunca copie uma Rule de
   memória ou do frontend.
5. Não remova imediatamente índices aditivos; isso não corrige o frontend e pode
   quebrar consultas ainda ativas. Remoção exige outra janela e prova de uso.
6. Revalide privacidade, login, pedido corrente, atribuição e reservas. Se houver
   inconsistência de dados, pare: não execute limpeza ou migração improvisada.

A ordem Pages → Worker/Rules depende da causa, mas o par frontend/Rules restaurado
deve ser comprovadamente compatível. Se não houver snapshot compatível, mantenha
o acesso interrompido e escale; não abra permissões para recuperar disponibilidade.

## Critério de conclusão

A preparação local pode ser aprovada com verificações externas explicitamente
pendentes. A #54 só pode ser concluída depois de anexar o template de evidências
preenchido com URL pública, contas/dispositivos separados, sincronização real,
privacidade, upload ImageKit real e resultados de rollback/smoke. Ausência de
acesso Cloudflare, navegador ou dispositivo deve permanecer registrada como
limitação, nunca como sucesso presumido.
