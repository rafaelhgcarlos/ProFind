# ProFind

Base web/PWA mobile-first para conectar pessoas a profissionais de serviços.

## Requisitos

- Node.js 22 ou superior
- npm 10 ou superior

## Comandos

```bash
npm install
npm run dev
```

Antes de iniciar a aplicação, copie `.env.example` para
`.env.development.local` e preencha os dados do seu projeto Firebase. O Vite
carrega automaticamente arquivos específicos por modo, como
`.env.development.local` e `.env.production.local`; esses arquivos não são
versionados.

As credenciais públicas de configuração do cliente devem ser obtidas em
**Firebase Console > Configurações do projeto > Seus aplicativos**. No Firebase
Console, habilite também **Authentication > E-mail/senha** e crie o banco do
Cloud Firestore no plano Spark. Firebase Storage e Cloud Functions não fazem
parte desta etapa.

Se alguma variável obrigatória estiver ausente, a inicialização informa o modo
atual e lista exatamente quais variáveis precisam ser configuradas.

Também estão disponíveis:

- `npm run build`: valida o TypeScript e gera o build de produção.
- `npm run typecheck`: valida somente os tipos.
- `npm run lint`: executa o ESLint.
- `npm test`: executa os testes uma vez.
- `npm run test:watch`: executa os testes em modo interativo.
- `npm run preview`: serve localmente o build de produção.

## Organização

O código é separado em `components`, `features`, `hooks`, `lib`,
`repositories`, `routes`, `services`, `styles`, `types` e `utils`. O acesso a
fontes de dados deve ficar em repositories e a lógica de aplicação em services;
componentes e páginas não devem executar queries complexas diretamente.

O SDK do Firebase é inicializado em `src/lib/firebase`. Auth e Firestore são
expostos por módulos próprios, enquanto operações de autenticação por
e-mail/senha ficam em `src/services/auth.service.ts`.

O cadastro público está disponível em `/cadastro`. A criação da identidade no
Firebase Auth é coordenada com o documento base `users/{userId}` pelo serviço de
registro; se a gravação do perfil falhar, a identidade recém-criada é removida
como compensação. O documento registra nome, e-mail e timestamps de criação,
atualização e aceite dos Termos de Uso e da Política de Privacidade, incluindo
as versões vigentes de ambos os documentos. Os textos do MVP ficam disponíveis
em `/termos-de-uso` e `/politica-de-privacidade`.

As regras mínimas para criação e leitura do próprio documento de usuário estão
versionadas em `firestore.rules`. Depois de criar o banco Cloud Firestore,
publique-as no mesmo projeto configurado no `.env`:

```bash
npx firebase-tools deploy --only firestore:rules --project SEU_PROJECT_ID
```

Sem esse deploy, projetos criados no modo bloqueado retornam
`permission-denied` após o Firebase Auth criar a identidade; o fluxo remove a
identidade automaticamente, mas o cadastro não pode ser concluído. Ao atualizar
as versões dos documentos jurídicos, atualize também as versões permitidas nas
regras antes de publicar a nova interface.

## Design system

O design system usa Tailwind CSS com tokens semânticos definidos em
`src/styles/global.css`. Componentes de interação complexa usam primitives do
Radix UI seguindo a composição do shadcn/ui, e toda a iconografia vem do Lucide.

A preferência de aparência aceita `light`, `dark` e `system`, fica persistida no
dispositivo e é aplicada antes do carregamento do React para evitar flash do
tema incorreto. O catálogo interno está disponível em `/design-system`; os
previews de layout ficam sob `/design-system/layouts/*`.

Os layouts reutilizáveis estão separados em público, Cliente, Profissional e
Admin. Cliente e Profissional compartilham os mesmos tokens e primitives, mas
possuem navegação orientada às respectivas tarefas. A estrutura Admin permanece
separada para não acoplar sua experiência ao marketplace.

As [diretrizes globais de UX/UI](docs/ux-ui-guidelines.md) são requisito
transversal para toda nova interface. Elas definem hierarquia, padrões por
contexto, privacidade visível, estados de feedback e o checklist de entrega de
frontend estabelecidos pela Issue #41.
