/**
 * Histórico de compras encerradas, com "duplicar".
 *
 * Duplicar gera uma LISTA, não um carrinho pronto: preço de mês passado não é
 * preço de hoje, e um total pré-preenchido teria cara de verdade estando
 * desatualizado. Ver `duplicateTrip.ts`.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Button, Paragraph, ScrollView, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { duplicateTripAsList } from '../db/repositories/duplicateTrip';
import { finishedTrips, itemsOfTrip } from '../db/repositories/tripRepo';
import type { ShoppingTripRow } from '../db/schema';
import { useListStore } from '../state/listStore';
import { Eyebrow, Money, TABULAR } from '../ui/kit';
import { formatCents } from '../ui/money';

function formatarData(epochMs: number | null): string {
  if (!epochMs) return '';
  const d = new Date(epochMs);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const ctx = useMemo(() => appRepoContext(), []);
  const recarregarListas = useListStore((s) => s.reload);
  const attachListas = useListStore((s) => s.attach);

  const [trips, setTrips] = useState<ShoppingTripRow[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      attachListas(ctx);
      setTrips(finishedTrips(ctx.db));
    }, [attachListas, ctx]),
  );

  function duplicar(trip: ShoppingTripRow) {
    const nome = `Compra de ${formatarData(trip.finishedAt)}`;
    const r = duplicateTripAsList(ctx, trip.id, nome);
    recarregarListas();
    setAviso(
      r.itemCount === 0
        ? 'Aquela compra não tinha itens — a lista foi criada vazia.'
        : `Lista "${nome}" criada com ${r.itemCount} ${r.itemCount === 1 ? 'item' : 'itens'}. Os preços vêm do escaneamento novo.`,
    );
  }

  if (trips.length === 0) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$3" p="$4">
        <Paragraph color="$color10" text="center">
          Nenhuma compra encerrada ainda. Quando você finalizar uma compra, ela aparece aqui — e dá
          para repetir a lista dela.
        </Paragraph>
        <Button onPress={() => router.replace('/')}>Voltar</Button>
      </YStack>
    );
  }

  return (
    <ScrollView
      flex={1}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ p: '$3', gap: '$3' }}>
      {aviso ? (
        <YStack p="$4" bg="$green2" rounded="$6">
          <Paragraph size="$3" color="$green11">
            {aviso}
          </Paragraph>
          <Button size="$2" mt="$2" onPress={() => router.push('/lists')}>
            Ver listas
          </Button>
        </YStack>
      ) : null}

      {trips.map((trip) => {
        const itens = itemsOfTrip(ctx.db, trip.id);
        const estourou = trip.budgetCents !== null && trip.totalCents > trip.budgetCents;
        return (
          <YStack key={trip.id} gap="$2" p="$4" bg="$color2" rounded="$6">
            <XStack justify="space-between" items="baseline" gap="$2">
              <Eyebrow>{formatarData(trip.finishedAt)}</Eyebrow>
              <Money
                cents={trip.totalCents}
                format={formatCents}
                size="$7"
                color={estourou ? '$red10' : undefined}
              />
            </XStack>

            <Paragraph size="$2" color="$color10" {...TABULAR}>
              {`${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
              {trip.budgetCents
                ? ` · teto de ${formatCents(trip.budgetCents)}${estourou ? ' (estourou)' : ''}`
                : ''}
            </Paragraph>

            {itens.slice(0, 4).map((item) => (
              <Paragraph key={item.id} size="$2">
                {`• ${item.rawName}`}
              </Paragraph>
            ))}
            {itens.length > 4 ? (
              <Paragraph size="$2" color="$color10">
                {`e mais ${itens.length - 4}…`}
              </Paragraph>
            ) : null}

            <Button size="$3" mt="$1" onPress={() => duplicar(trip)}>
              Repetir esta compra como lista
            </Button>
          </YStack>
        );
      })}
    </ScrollView>
  );
}
