# Privacidade do perfil profissional

O perfil profissional é dividido em dois documentos para que consultas de
descoberta nunca precisem carregar dados de localização ou contato privados.

## Documento público

`professionalProfiles/{userId}` mantém os dados de apresentação criados na
Issue #8 e, para localização e atendimento, somente:

- `baseLocation.city`, `baseLocation.stateCode` e `baseLocation.ibgeCode`;
- `serviceMode`, limitado a `CITY_ONLY`, `RADIUS` ou `SELECTED_CITIES`;
- `serviceRadiusKm` e `selectedCities`, conforme a modalidade;
- `availability`;
- `contactVisibility`;
- `phone` apenas quando `contactVisibility` for `PUBLIC`.
- `profileImage` e `portfolioImages` somente com proprietário, finalidade, URL
  HTTPS, identificador do provedor, timestamps, ordem e texto alternativo.

Ao trocar a visibilidade para `PRIVATE`, o repository remove `phone` do
documento público no mesmo batch que atualiza o documento privado. CEP, bairro,
rua, número e complemento nunca são aceitos pelas regras nesse documento.
Arquivo bruto, data URL, base64 e campos adicionais dentro dos metadados de
imagem também são rejeitados.
As regras exigem `PROFESSIONAL_AVATAR` na foto e
`PROFESSIONAL_PORTFOLIO` no portfólio, sempre com `ownerId` igual ao dono do
perfil; referências de `CLIENT_AVATAR` não são aceitas nesse documento.

## Documento privado

`professionalPrivateProfiles/{userId}` mantém:

```ts
{
  ownerId: string
  phone: string
  privateLocation: {
    postalCode: string
    neighborhood?: string
  }
  updatedAt: Timestamp
}
```

As regras permitem leitura e escrita somente ao proprietário. Visitantes e
outros usuários autenticados não podem ler ou alterar o documento. Backends
confiáveis que usam o Firebase Admin SDK não dependem das Security Rules do
cliente.

## CEP e fallback manual

O service de CEP encapsula `fetch`, timeout de cinco segundos, máscara e
normalização. A consulta ao ViaCEP só ocorre com oito dígitos e diferencia:

- formato inválido ou HTTP 400;
- CEP inexistente;
- resposta inválida;
- timeout;
- navegador offline;
- indisponibilidade ou erro de rede do provedor.

Em qualquer falha, a interface mantém UF e município disponíveis. Essa seleção
reutiliza o service da API de Localidades do IBGE e preserva `ibgeCode` como o
identificador estável do município. O ViaCEP auxilia o preenchimento e não é
tratado como fonte de autorização ou identidade.

## Disponibilidade

A ação “Atualizar disponibilidade” grava apenas `availability` e `updatedAt`.
Ela não altera o status `DRAFT`, `PUBLISHED` ou `PAUSED`, nem o resumo do usuário.

## Testes de regras

Execute `npm run test:rules`. A suíte usa o emulador do Firestore e cobre:

- leitura pública do perfil sem campos privados;
- bloqueio de leitura privada para visitante;
- bloqueio de leitura e escrita para usuário autenticado não proprietário;
- leitura e escrita privada pelo proprietário;
- rejeição de CEP, bairro e localização privada no documento público.
- aceitação apenas dos metadados mínimos de imagem e rejeição de base64.
