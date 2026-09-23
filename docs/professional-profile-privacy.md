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

## Foto do profissional

A foto usa o mesmo `ImageProvider` e o mesmo endpoint autenticado do ImageKit
usados pelo perfil do cliente, mas sempre com a finalidade
`PROFESSIONAL_AVATAR`. O Worker deriva o UID exclusivamente do Firebase ID Token
validado e direciona o arquivo para `/profind/professionals/{uid}/avatar`.

Durante uma troca, a referência profissional já persistida continua ativa
enquanto o upload está em andamento ou apresenta erro. A nova `ImageReference`
só substitui a anterior depois que o perfil é salvo. Somente então a foto antiga
é removida do provedor; se essa limpeza falhar, a nova foto permanece salva e a
interface oferece retry. O preview `blob:` é exclusivamente local e temporário,
e nunca chega ao repository.

Ao remover a foto sem substituição, o mesmo princípio é preservado: o Worker
autoriza a operação enquanto `PROFESSIONAL_AVATAR` ainda está persistido, o
perfil é salvo sem a referência e o arquivo só é apagado depois. Uma falha ao
salvar não remove a foto do ImageKit. O perfil do cliente aplica o fluxo
equivalente de forma isolada com `CLIENT_AVATAR`.

Após salvar, o contexto da sessão recebe o perfil profissional atualizado. O
header do modo Profissional renderiza sua URL HTTPS, enquanto o modo Cliente
continua usando exclusivamente `CLIENT_AVATAR`. Em refresh, remount, novo login
ou troca de modo, o contexto recarrega a referência do documento profissional.
O contrato `PROFESSIONAL_PORTFOLIO` permanece separado e inalterado.

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
- isolamento de `PROFESSIONAL_AVATAR` por proprietário e finalidade.
