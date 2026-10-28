# Autocadastro profissional e acompanhamento da análise

## Jornada entregue

O cadastro, login e onboarding continuam usando uma identidade Firebase única.
Escolher `Profissional` ou `Ambos` adiciona somente o papel de navegação ao
próprio `users/{uid}`. Isso permite abrir `/profissional/perfil`, mas não cria
aprovação, ativação, projeção aprovada ou acesso a oportunidades.

O primeiro salvamento cria `professionalProfiles/{uid}` e
`professionalOperationalProfiles/{uid}` na mesma transação, sempre usando o
UID autenticado. Rascunhos iniciam em `DRAFT`; um perfil completo salvo com a
ação **Enviar para análise** inicia `UNDER_REVIEW`. Retries relêem os mesmos
documentos e eventos determinísticos, sem criar outro cadastro.

A rota `/profissional/analise` mostra:

- rascunho, em análise, ajustes solicitados, aprovado, rejeitado e suspenso;
- versão atual, enviada e aprovada;
- feedback destinado ao profissional, sem notas internas;
- histórico imutável permitido pelas Rules;
- distinção entre aprovação e ativação operacional.

Ao salvar correções em `CHANGES_REQUESTED`, o serviço existente incrementa a
versão e registra `PROFILE_RESUBMITTED` atomicamente. Alterar dados analisáveis
de uma versão aprovada exige reanálise. Disponibilidade usa a operação separada
e não altera versão, reservas ou atendimentos existentes. Rejeição e suspensão
permanecem até uma transição administrativa válida.

## Suporte

O canal oficial informado para esta entrega é `+55 12 99170-6194`. O destino
pode ser substituído com `VITE_SUPPORT_WHATSAPP_NUMBER`; um valor vazio ou
inválido desabilita o link sem criar outro contato. O link abre o WhatsApp com
uma mensagem genérica sobre ajuda no cadastro. UID, e-mail, senha, documentos e
campos do formulário não entram na URL e a mensagem não é enviada
automaticamente.

## Perfis legados

`npm run migration:professional-review:preview -- --input <export-local.json>
--actor-id <uid-admin>` lê somente um arquivo JSON local e imprime um plano.
Ele não importa SDK administrativo, não se conecta ao Firebase e não aplica
gravações. O formato esperado é:

```json
{
  "professionalProfiles": [{ "id": "uid", "data": {} }],
  "professionalOperationalProfiles": [{ "id": "uid", "data": {} }]
}
```

O plano ignora UIDs que já possuem documento operacional e prepara somente os
ausentes como `DRAFT`, inativos e sem versão aprovada. Mesmo um perfil legado
com `status: PUBLISHED` nunca recebe aprovação inferida. A futura execução
confiável deve validar a prévia, usar o UID real do administrador responsável e
gravar documento/evento atomicamente. Nenhuma migração remota faz parte desta
entrega.

## Teste manual local

1. Criar uma conta nova e escolher `Profissional`; confirmar que a mesma conta
   abre o cadastro e que oportunidades/aceites continuam bloqueados.
2. Salvar um perfil incompleto como rascunho, recarregar e confirmar o mesmo
   UID e os mesmos dados.
3. Tentar enviar o perfil incompleto; conferir erros por campo e ausência de
   confirmação falsa.
4. Completar texto, catálogo, município e imagens; enviar e conferir
   `UNDER_REVIEW` na tela de análise.
5. No emulador, usar fixture administrativa para produzir
   `CHANGES_REQUESTED`; conferir feedback, corrigir e reenviar.
6. Usar fixtures para `APPROVED` inativo e ativo; somente o segundo, com
   `approvedVersion == profileVersion`, deve ser elegível.
7. Alterar foto, portfólio ou texto analisável de um aprovado; conferir nova
   versão/reanálise. Alterar apenas disponibilidade e confirmar que a versão e
   os atendimentos permanecem.
8. Usar fixtures `REJECTED` e `SUSPENDED`; confirmar que editar ou alternar
   modo não remove o estado.
9. Abrir o suporte no onboarding, perfil e análise; conferir o número oficial e
   que a URL contém somente a mensagem genérica.

## Pendências deliberadas

- A fila e as decisões administrativas visuais pertencem à #32. Nesta entrega,
  decisões são fixtures do emulador ou chamadas de serviço nos testes.
- A aplicação hospedada e o upload real continuam dependentes da validação da
  #54; mocks não são declarados como prova de upload real.
- A prévia de migração não executa alterações remotas.
