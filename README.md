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
