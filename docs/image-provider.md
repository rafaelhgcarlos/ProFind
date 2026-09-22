# Provedor de imagens

Fotos do perfil e do portfólio usam a interface `ImageProvider`. A feature de
perfil conhece apenas esse contrato e o service de imagens; ela não importa um
SDK de armazenamento. Firebase Storage não é usado.

## Seleção do adapter

O adapter é escolhido pela factory em `src/providers/image-provider.factory.ts`:

- `VITE_IMAGE_PROVIDER=mock`: adapter em memória para desenvolvimento e testes;
- `VITE_IMAGE_PROVIDER=backend`: cliente HTTP para um backend seguro;
- `VITE_IMAGE_PROVIDER=disabled`: desabilita novos uploads sem impedir a edição
  dos outros campos do perfil.

O mock é recusado em builds de produção. Para o adapter `backend`, configure
`VITE_IMAGE_API_BASE_URL` com uma rota relativa, como `/api/media`, ou uma URL
HTTPS. Uma configuração ausente ou inválida deixa o envio desabilitado e a
interface informa a indisponibilidade.

Nenhuma chave secreta pode usar o prefixo `VITE_`: variáveis com esse prefixo
são incorporadas ao JavaScript entregue ao navegador.

## Contrato do backend seguro

O adapter preparado nesta etapa espera autenticação por sessão segura e envia:

- `POST {baseUrl}/images`, como `multipart/form-data`, com `file`, `purpose` e
  `ownerId`;
- `DELETE {baseUrl}/images/{providerId}`, com `{ ownerId, purpose }` em JSON.

O backend deve autenticar a sessão, validar que o usuário pode operar o
`ownerId`, repetir as validações de tipo/tamanho e manter credenciais do
provedor somente no servidor. A resposta do upload deve ser:

```json
{
  "url": "https://cdn.example/image.webp",
  "providerId": "provider-object-id"
}
```

Trocar de provedor exige somente outro adapter que implemente `upload`, `retry`
e `remove`, seguido da inclusão correspondente na factory. Nenhuma feature ou
repository deve importar o SDK desse provedor.

## Finalidade e isolamento

Toda operação usa uma finalidade da união discriminada `ImagePurpose`:

- `CLIENT_AVATAR`: avatar do contexto Cliente;
- `PROFESSIONAL_AVATAR`: foto do perfil profissional;
- `PROFESSIONAL_PORTFOLIO`: trabalho do portfólio profissional.

A referência registra `ownerId` e `purpose`. Upload, retry, substituição e
remoção transportam ambos os valores, e o backend deve compará-los com a sessão
autenticada e com o objeto armazenado. Uma URL de portfólio nunca é promovida a
avatar implicitamente. Assim, uma conta com os dois papéis mantém avatares
independentes.

## Validação, estados e persistência

Antes do envio, o frontend aceita JPEG, PNG ou WebP, limita cada arquivo a 5 MB
e o portfólio a três imagens. Cada item mantém preview local, progresso, erro e
retry independentes. Uma falha não limpa os demais dados do formulário.

O Firestore recebe somente:

```ts
{
  ownerId: string
  purpose: ImagePurpose
  url: string
  providerId: string
  createdAt: number
  updatedAt: number
}
```

As referências profissionais acrescentam os campos de apresentação:

```ts
{
  order: number
  altText: string
}
```

Arquivos, `Blob`, `File`, data URL e base64 não são persistidos. As Security
Rules limitam as chaves do mapa, exigem URL HTTPS, validam ordem e quantidade e
exigem texto alternativo para publicar. A remoção do provedor só altera o
formulário após confirmação; o perfil é persistido quando o usuário salva.

Na substituição, a referência antiga permanece vigente até a remoção ser
confirmada. Se a nova imagem for enviada e a remoção anterior falhar, o service
devolve um erro com `recoveryReference`, permitindo nova tentativa de limpeza
sem sobrescrever silenciosamente o avatar ou portfólio.

## Encerramento da conta

A #47 será responsável por orquestrar a exclusão global. Esse fluxo deverá
coletar `users/{userId}.clientAvatar`,
`professionalProfiles/{userId}.profileImage` e os itens de `portfolioImages`,
agrupá-los por `purpose`, chamar `ImageProvider.remove` com o mesmo `ownerId` e
finalidade de cada item e remover cada referência do Firestore somente após
confirmação do provedor. Falhas devem permanecer registradas para retry
idempotente. Esta issue fornece o contrato e o isolamento necessários, mas não
implementa nem antecipa essa orquestração.

## Verificação local

Use `npm test`, `npm run test:rules`, `npm run typecheck`, `npm run lint` e
`npm run build`. A integração com um provedor real demanda backend e credenciais
próprios, mas não é necessária para executar a suíte desta etapa.
