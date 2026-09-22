# ProFind

Base web/PWA mobile-first para conectar pessoas a profissionais de serviços.

## Requisitos

- Node.js 22 ou superior
- npm 10 ou superior
- JDK 21 ou superior para executar o emulador do Firestore

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
- `npm run test:rules`: inicia o emulador do Firestore e executa os testes de
  privacidade das regras.
- `npm run test:watch`: executa os testes em modo interativo.
- `npm run preview`: serve localmente o build de produção.
- `npm run seed:catalog -- --project=SEU_PROJECT_ID`: cria ou atualiza o
  catálogo inicial de categorias e especialidades.

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
as versões vigentes de ambos os documentos. Também inicia `roles` vazio,
`activeMode` nulo e `professionalProfileStatus` como `not-started` para que a
escolha de contexto aconteça no onboarding sem confundir um papel habilitado
com um perfil profissional completo. Os textos do MVP ficam disponíveis em
`/termos-de-uso` e `/politica-de-privacidade`.

Depois do cadastro ou do primeiro login de uma conta ainda sem papéis, a rota
`/onboarding` permite escolher Cliente, Profissional ou Ambos. A configuração é
persistida no próprio documento `users/{userId}`; contas com os dois papéis
alternam somente o `activeMode`, preservando a mesma identidade. O serviço e as
regras do Firestore rejeitam modos que não estejam em `roles`. No MVP, o papel
Profissional representa exclusivamente pessoa física.

As regras para criação, leitura do próprio documento e atualização controlada
de `roles`/`activeMode` estão versionadas em `firestore.rules`. Depois do
onboarding, papéis nunca podem ser removidos e só podem ser adicionados de forma
monotônica quando existir um grant em
`roleEnablementGrants/{userId}/roles/{role}`, emitido exclusivamente por um
backend confiável. O cliente não possui acesso a esses grants. A alternância de
`activeMode` continua limitada aos papéis presentes em `roles`, enquanto
`professionalProfileStatus` não pode ser alterado diretamente pelo cliente.
Depois de criar o banco Cloud Firestore, publique as regras no mesmo projeto
configurado no `.env`:

```bash
npx firebase-tools deploy --only firestore:rules --project SEU_PROJECT_ID
```

Sem esse deploy, projetos criados no modo bloqueado retornam
`permission-denied` após o Firebase Auth criar a identidade; o fluxo remove a
identidade automaticamente, mas o cadastro não pode ser concluído. Ao atualizar
as versões dos documentos jurídicos, atualize também as versões permitidas nas
regras antes de publicar a nova interface.

O catálogo público de serviços usa `categories/{categoryId}` e
`specialties/{specialtyId}`. A aplicação consulta essas coleções por repository
e service, ordena por `order` e oferece em novos fluxos somente itens com
`active: true` vinculados a categorias ativas. Escritas pelo cliente são
bloqueadas. O modelo, a administração e a carga inicial estão documentados em
[`docs/service-catalog.md`](docs/service-catalog.md).

Profissionais configurados no onboarding criam e editam seu perfil em
`/profissional/perfil`. Os dados ficam em `professionalProfiles/{userId}` e
podem ser mantidos incompletos com status `DRAFT`. A publicação exige nome
público, localização base estruturada (`city`, `stateCode` e
`ibgeCode`), categoria, especialidade e uma modalidade de atendimento válida.
A descrição é opcional e, quando informada, aceita até 1.200 caracteres.
O raio é obrigatório somente na modalidade `RADIUS`. CEP e endereço
exato não são armazenados no perfil público. Perfis `PAUSED` permanecem
privados e `SUSPENDED` não podem ser
alterados pelo cliente. As regras permitem escrita somente ao proprietário e
impedem mudanças em rating, contagem de avaliações e serviços concluídos.
O resumo `professionalProfileStatus` em `users/{userId}` é atualizado no mesmo
batch para manter a jornada profissional consistente.

Na seção de atendimento, a UF é escolhida antes do município. Os municípios
são carregados da API oficial de Localidades do IBGE, com pesquisa, cache por
UF e nova tentativa em caso de falha. O perfil registra também a modalidade
`CITY_ONLY`, `RADIUS` ou `SELECTED_CITIES`; somente `RADIUS` exige uma das
faixas configuradas e `SELECTED_CITIES` mantém até dez municípios únicos. A
modalidade `REMOTE` não faz parte do MVP. Perfis legados com esse valor são
tratados como rascunho e exigem uma nova escolha antes da republicação, sem
conversão automática.

O mesmo formulário aceita CEP com máscara, consulta o ViaCEP somente quando há
oito dígitos e preenche cidade, UF, código IBGE e bairro. Falhas de validação,
CEP inexistente, timeout, falta de rede ou indisponibilidade do provedor não
bloqueiam o preenchimento manual padronizado pela API de Localidades do IBGE.
Telefone, visibilidade do contato e disponibilidade também são editáveis. A
disponibilidade possui uma gravação isolada, que não altera `status` nem
republica um perfil pausado ou em rascunho.

Os limites entre dados públicos e privados do perfil, incluindo as coleções
`professionalProfiles` e `professionalPrivateProfiles`, estão documentados em
[`docs/professional-profile-privacy.md`](docs/professional-profile-privacy.md).

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
