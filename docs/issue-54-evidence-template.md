# Issue #54 — evidências de publicação

Copie este template para o registro privado da execução. Não inclua senhas,
tokens, chaves, cabeçalhos Authorization ou dados pessoais reais.

## Identificação

- run ID:
- commit/tag:
- data, fuso e responsáveis:
- Pages deployment ID/URL:
- Worker version ID/origin HTTPS:
- Firebase project: `profind-42bf7`
- navegador/dispositivo por conta:

## Resultado local

| Verificação | Comando | Resultado/data | Evidência/observação |
| --- | --- | --- | --- |
| TypeScript | `npm run typecheck` |  |  |
| lint | `npm run lint` |  |  |
| aplicação | `npm test -- --run` |  |  |
| regressão UI jsdom | `npm run test:ui:regression` |  | não substitui browser real |
| Worker | `npm run test:worker` |  | doubles, não upload real |
| concorrência #39 | `npm run test:concurrency:emulator` |  |  |
| Rules | `npm run test:rules` |  |  |
| build de release | `npm run build:release` |  |  |
| diff | `git diff --check` |  |  |

## Infraestrutura externa

- [ ] `profind.pages.dev` em Firebase Auth Authorized domains.
- [ ] índice `serviceRequests(clientId ASC, status ASC)` em `READY`.
- [ ] Rules publicadas do mesmo commit do frontend.
- [ ] endpoint HTTPS exato do Worker incorporado ao bundle.
- [ ] `https://profind.pages.dev` em `ALLOWED_ORIGINS`.
- [ ] `IMAGEKIT_PRIVATE_KEY` existe somente como secret do Worker.
- [ ] deployment anterior de Pages/Worker e snapshot anterior das Rules anotados.

## Rotas e sessão hospedadas

| Rota | acesso direto | recarga | sessão expirada | resultado |
| --- | --- | --- | --- | --- |
| `/` |  |  | n/a |  |
| `/cadastro` |  |  | n/a |  |
| `/entrar` |  |  | n/a |  |
| `/cliente` |  |  |  |  |
| `/cliente/pedidos/{id}` |  |  |  |  |
| `/profissional/oportunidades/{id}` |  |  |  |  |
| `/profissional/atendimentos/{id}` |  |  |  |  |
| `/admin` |  |  |  |  |

## Jornada multiusuário

- [ ] A/B/C/D fizeram autocadastro pela interface.
- [ ] ajuste → correção → reenvio → aprovação/ativação comprovados.
- [ ] pendente, rejeitado/inativo e suspenso não recebem novas oportunidades.
- [ ] D incompatível não vê/não aceita o pedido.
- [ ] A/B/C compatíveis veem somente dados pré-aceite permitidos.
- [ ] dois aceites reais; vencedor não foi forçado; exatamente um confirmado.
- [ ] cancelamento liberou reserva e abriu rodada coerente.
- [ ] antigo responsável perdeu acesso privado; substituto recebeu acesso.
- [ ] cliente acompanhou substituição, início e conclusão em tempo real/recarga.
- [ ] recusa, indisponibilidade, ausência de aceite e relato de falta demonstrados.
- [ ] pedido, atribuições, reservas, rodadas e eventos conferidos.

Vencedor real da disputa (rótulo, sem credencial):

Resultado e tempos observados:

## ImageKit real

| Finalidade | upload | recarga | substituição | remoção | falha/recuperação |
| --- | --- | --- | --- | --- | --- |
| `CLIENT_AVATAR` |  |  |  |  |  |
| `PROFESSIONAL_AVATAR` |  |  |  |  |  |
| `PROFESSIONAL_PORTFOLIO` |  |  |  |  |  |

- [ ] respostas reais HTTPS/ImageKit; nenhum mock usado como prova.
- [ ] isolamento por UID/finalidade negou tentativa cruzada.
- [ ] mudança profissional persistida acionou reanálise.
- [ ] avatar do cliente permaneceu independente.
- [ ] referência válida anterior foi preservada nas falhas induzidas.

## UX em navegador/dispositivo real

| Viewport/tema | teclado | zoom 200% | overflow | avatar após rolagem | resultado |
| --- | --- | --- | --- | --- | --- |
| mobile claro |  |  |  |  |  |
| mobile escuro |  |  |  |  |  |
| desktop claro |  |  |  |  |  |
| desktop escuro |  |  |  |  |  |
| sistema |  |  |  |  |  |

## Cotas e observabilidade

- leituras/escritas Firestore durante o roteiro:
- erros de índice/Rules:
- invocações/erros do Worker:
- bandwidth/armazenamento ImageKit:
- listeners/páginas observados:

## Rollback/smoke

- deployment/versão anterior registrada:
- procedimento ensaiado ou limitação:
- resultado do smoke pós-publicação:

## Separação final

### Aprovado localmente


### Aprovado hospedado


### Pendente ou não executado


### Limitações de acesso/dispositivo/configuração
