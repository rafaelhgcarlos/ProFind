# Disponibilidade profissional por data e período

A issue #14 mantém o campo legado `professionalProfiles.availability` durante a
migração e acrescenta a agenda discreta usada pelo matching:

```text
professionalAvailability/{professionalId}/slots/{YYYY-MM-DD_PERIOD}
professionalReservations/{professionalId}/slots/{YYYY-MM-DD_PERIOD}
```

Cada data possui os períodos `MORNING`, `AFTERNOON` e `EVENING`, no fuso
`America/Sao_Paulo`. A tela `/profissional/disponibilidade` permite editar os
próximos 90 dias. Ela acessa cada caminho determinístico; não lista agendas de
terceiros e não faz varredura de coleção.

Salvar disponibilidade grava somente os três documentos de slot da data. Não
atualiza `professionalProfiles`, `professionalOperationalProfiles`, versões de
análise, atribuições nem reservas. Um período reservado aparece bloqueado na
interface e sua reserva continua sendo a trava única da agenda, mesmo que uma
gravação direta autorizada altere o indicador operacional do slot.

As Security Rules garantem que:

- somente o próprio UID cria ou atualiza seus slots;
- data/período e ID determinístico precisam concordar;
- nenhuma edição de disponibilidade concede aprovação ou ativação;
- reservas não podem ser apagadas pelo editor de agenda;
- pendência, restrição, inatividade ou aprovação desatualizada bloqueiam o feed,
  sem revogar a leitura do atendimento já atribuído.

O emulador valida edição, isolamento entre UIDs, preservação de reserva e
aprovação, paginação das oportunidades e revalidação transacional do aceite.
