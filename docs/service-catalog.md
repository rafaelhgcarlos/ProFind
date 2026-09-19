# Catálogo de categorias e especialidades

O catálogo público fica em duas coleções do Cloud Firestore:

- `categories/{categoryId}`: `name` (string), `active` (boolean) e `order`
  (inteiro não negativo).
- `specialties/{specialtyId}`: os mesmos campos e `categoryId` (string), que
  referencia um documento existente em `categories`.

Os IDs são estáveis e não devem depender do nome exibido. `order` controla a
ordenação crescente. Para retirar uma opção de novos fluxos sem apagar o
histórico, altere `active` para `false`. Uma especialidade também deixa de ser
oferecida quando sua categoria está inativa.

O cliente pode ler as duas coleções, mas as Security Rules recusam escritas.
A administração deve ser feita pelo Firebase Console ou por um ambiente
confiável com o SDK de servidor do Firestore.

## Carga inicial

Autentique o Application Default Credentials e execute, sempre informando o
projeto explicitamente:

```bash
npm run seed:catalog -- --project=SEU_PROJECT_ID
```

Para o Firestore Emulator, configure `FIRESTORE_EMULATOR_HOST` e use um ID de
projeto local. O seed usa IDs determinísticos e `merge`, portanto pode ser
executado novamente sem duplicar documentos. Ele cria os dados iniciais da
issue #7 para Construção Civil e Serviços Domésticos.
