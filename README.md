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
