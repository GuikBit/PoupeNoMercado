/**
 * Finalização: resumo da compra e comparação com o orçamento.
 *
 * É o fecho da promessa do produto — a pessoa chega no caixa já sabendo o
 * total. A tela mostra quanto foi gasto, quanto o app economizou aproveitando
 * faixas, e o que ficou pendente na lista.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Button, Paragraph, ScrollView, Separator, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { itemsOfList } from '../db/repositories/listRepo';
import { useTripStore } from '../state/tripStore';
import { formatCents, formatQuantity } from '../ui/money';

export default function SummaryScreen() {
  const router = useRouter();
  const ctx = useMemo(() => appRepoContext(), []);
  const { trip, lines, budget, attach, finish } = useTripStore();

  useFocusEffect(
    useCallback(() => {
      attach(ctx);
    }, [attach, ctx]),
  );

  if (!trip) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$3" p="$4">
        <Paragraph color="$color10" text="center">
          Nenhuma compra em andamento.
        </Paragraph>
        <Button theme="accent" onPress={() => router.replace('/')}>
          Voltar para o início
        </Button>
      </YStack>
    );
  }

  const economia = lines.reduce((soma, l) => {
    const base = Math.round(l.policy.basePriceCents * l.row.qty);
    return soma + (base - l.row.totalCents);
  }, 0);
  const pendentes = trip.listId
    ? itemsOfList(ctx.db, trip.listId).filter((i) => i.checked === 0)
    : [];

  return (
    <ScrollView flex={1} contentContainerStyle={{ p: '$3', gap: '$3', pb: '$10' }}>
      <YStack items="center" gap="$1" p="$4" bg="$color2" rounded="$4">
        <Paragraph size="$3" color="$color10">
          Total da compra
        </Paragraph>
        <Paragraph size="$11" fontWeight="900">
          {formatCents(trip.totalCents)}
        </Paragraph>
        <Paragraph size="$2" color="$color10">
          {`${lines.length} ${lines.length === 1 ? 'item' : 'itens'}`}
        </Paragraph>
      </YStack>

      {budget.limitCents !== null ? (
        <YStack
          gap="$1"
          p="$3"
          rounded="$4"
          bg={budget.state === 'over' ? '$red2' : budget.state === 'warning' ? '$yellow2' : '$green2'}
        >
          <Paragraph
            size="$5"
            fontWeight="700"
            color={
              budget.state === 'over' ? '$red11' : budget.state === 'warning' ? '$yellow11' : '$green11'
            }
          >
            {budget.state === 'over'
              ? `Passou ${formatCents(Math.abs(budget.remainingCents ?? 0))} do orçamento`
              : `Sobrou ${formatCents(budget.remainingCents ?? 0)}`}
          </Paragraph>
          <Paragraph size="$2" color="$color10">
            {`Teto de ${formatCents(budget.limitCents)}`}
          </Paragraph>
        </YStack>
      ) : null}

      {economia > 0 ? (
        <YStack gap="$1" p="$3" bg="$green2" rounded="$4">
          <Paragraph size="$4" fontWeight="700" color="$green11">
            {`Você economizou ${formatCents(economia)} aproveitando as faixas`}
          </Paragraph>
          <Paragraph size="$2" color="$green11">
            Comparado a pagar o preço de uma unidade em cada item.
          </Paragraph>
        </YStack>
      ) : null}

      <Separator />

      {lines.map((line) => (
        <XStack key={line.row.id} justify="space-between" gap="$2">
          <YStack flex={1}>
            <Paragraph size="$3">{line.row.rawName}</Paragraph>
            <Paragraph size="$1" color="$color10">
              {`${formatQuantity(line.row.qty, line.row.saleUnit)} × ${formatCents(line.row.unitPriceCents)}`}
            </Paragraph>
          </YStack>
          <Paragraph size="$4" fontWeight="700">
            {formatCents(line.row.totalCents)}
          </Paragraph>
        </XStack>
      ))}

      {pendentes.length > 0 ? (
        <YStack gap="$1" p="$3" bg="$yellow2" rounded="$4">
          <Paragraph size="$4" fontWeight="700" color="$yellow11">
            {`Ainda na lista: ${pendentes.length} ${pendentes.length === 1 ? 'item' : 'itens'}`}
          </Paragraph>
          {pendentes.slice(0, 8).map((item) => (
            <Paragraph key={item.id} size="$2" color="$yellow11">
              {`• ${item.name}`}
            </Paragraph>
          ))}
        </YStack>
      ) : null}

      <Separator />

      <Button
        size="$6"
        theme="accent"
        onPress={() => {
          finish();
          router.replace('/');
        }}
      >
        Encerrar compra
      </Button>
      <Button onPress={() => router.back()}>Voltar e continuar comprando</Button>
    </ScrollView>
  );
}
