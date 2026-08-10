/**
 * Finalização: resumo da compra e comparação com o orçamento.
 *
 * É o fecho da promessa do produto — a pessoa chega no caixa já sabendo o
 * total. A tela mostra quanto foi gasto, quanto o app economizou aproveitando
 * faixas, e o que ficou pendente na lista.
 *
 * O total vem primeiro e sozinho: é o número que vai ser conferido contra o
 * visor do caixa daqui a um minuto.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Button, Paragraph, ScrollView, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { itemsOfList } from '../db/repositories/listRepo';
import { useTripStore } from '../state/tripStore';
import { Eyebrow, Money, TABULAR } from '../ui/kit';
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

  const estourou = budget.state === 'over';

  return (
    <ScrollView
      flex={1}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ p: '$3', gap: '$4', pb: 40 }}
    >
      <YStack items="center" gap="$1" p="$5" bg="$color2" rounded="$6">
        <Eyebrow>Total da compra</Eyebrow>
        <Money cents={trip.totalCents} format={formatCents} size="$12" />
        <Paragraph size="$2" color="$color10" {...TABULAR}>
          {`${lines.length} ${lines.length === 1 ? 'item' : 'itens'}`}
        </Paragraph>
      </YStack>

      {budget.limitCents !== null ? (
        <YStack gap="$1" p="$4" rounded="$6" bg={estourou ? '$red2' : '$green2'}>
          <Paragraph size="$6" fontWeight="800" color={estourou ? '$red11' : '$green11'}>
            {estourou
              ? `Passou ${formatCents(Math.abs(budget.remainingCents ?? 0))}`
              : `Sobrou ${formatCents(budget.remainingCents ?? 0)}`}
          </Paragraph>
          <Paragraph size="$2" color={estourou ? '$red11' : '$green11'} {...TABULAR}>
            {`Teto de ${formatCents(budget.limitCents)}`}
          </Paragraph>
        </YStack>
      ) : null}

      {/* O que as faixas pouparam. É a prova de que ler a política inteira, e
          não só um preço, valeu a pena — o argumento do produto em um número. */}
      {economia > 0 ? (
        <YStack gap="$1" p="$4" bg="$green2" rounded="$6">
          <Eyebrow color="$green11">Economia nas faixas</Eyebrow>
          <Money cents={economia} format={formatCents} size="$8" color="$green11" />
          <Paragraph size="$2" color="$green11">
            Comparado a pagar o preço de uma unidade em cada item.
          </Paragraph>
        </YStack>
      ) : null}

      <YStack gap="$2">
        <Eyebrow count={lines.length}>Itens</Eyebrow>
        <YStack bg="$color2" rounded="$6" overflow="hidden">
          {lines.map((line, index) => (
            <XStack
              key={line.row.id}
              justify="space-between"
              gap="$3"
              px="$3"
              py="$3"
              borderTopWidth={index === 0 ? 0 : 1}
              borderColor="$color4"
            >
              <YStack flex={1} gap="$1">
                <Paragraph size="$4">{line.row.rawName}</Paragraph>
                <Paragraph size="$1" color="$color10" {...TABULAR}>
                  {`${formatQuantity(line.row.qty, line.row.saleUnit)} × ${formatCents(line.row.unitPriceCents)}`}
                </Paragraph>
              </YStack>
              <Paragraph size="$5" fontWeight="800" {...TABULAR}>
                {formatCents(line.row.totalCents)}
              </Paragraph>
            </XStack>
          ))}
        </YStack>
      </YStack>

      {pendentes.length > 0 ? (
        <YStack gap="$1" p="$4" bg="$yellow2" rounded="$6">
          <Paragraph size="$4" fontWeight="700" color="$yellow11">
            {`Ainda na lista: ${pendentes.length} ${pendentes.length === 1 ? 'item' : 'itens'}`}
          </Paragraph>
          {pendentes.slice(0, 8).map((item) => (
            <Paragraph key={item.id} size="$2" color="$yellow11">
              {`• ${item.name}`}
            </Paragraph>
          ))}
          {pendentes.length > 8 ? (
            <Paragraph size="$2" color="$yellow11">
              {`e mais ${pendentes.length - 8}…`}
            </Paragraph>
          ) : null}
        </YStack>
      ) : null}

      <YStack gap="$2">
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
        <Button chromeless color="$color10" onPress={() => router.back()}>
          Voltar e continuar comprando
        </Button>
      </YStack>
    </ScrollView>
  );
}
