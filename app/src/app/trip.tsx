/**
 * Compra ativa: total grande, barra de orçamento e os itens escaneados.
 *
 * O botão de escanear fica fixo no rodapé e ocupa a largura toda — é a ação
 * que se repete dezenas de vezes por compra, com o celular numa mão só.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Button, Paragraph, ScrollView, Separator, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { useTripStore } from '../state/tripStore';
import { NumericPad } from '../trip/NumericPad';
import { QuantityStepper } from '../trip/QuantityStepper';
import { TotalBar } from '../trip/TotalBar';
import { formatCents, formatQuantity, gramsToQuantity } from '../ui/money';
import { useKeepAwakeDuringTrip } from '../ui/useKeepAwake';

export default function TripScreen() {
  const router = useRouter();
  const ctx = useMemo(() => appRepoContext(), []);
  const { trip, lines, budget, attach, setQty, remove, toggleStoreCard, undoLastAdd, lastAddedId } =
    useTripStore();
  const [pesando, setPesando] = useState<{ itemId: string; gramas: number } | null>(null);

  // A compra pode durar 40 minutos; a tela não pode apagar no meio.
  useKeepAwakeDuringTrip();

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

  if (pesando) {
    const item = lines.find((l) => l.row.id === pesando.itemId);
    return (
      <YStack flex={1} gap="$3" p="$4">
        <Paragraph size="$5" fontWeight="700">
          {item?.row.rawName}
        </Paragraph>
        <NumericPad
          label="Peso em gramas"
          valueCents={pesando.gramas}
          format={(g) => formatQuantity(gramsToQuantity(g), item?.row.saleUnit ?? 'KG')}
          onChange={(gramas) => setPesando({ ...pesando, gramas })}
        />
        <XStack gap="$2">
          <Button flex={1} onPress={() => setPesando(null)}>
            Cancelar
          </Button>
          <Button
            flex={2}
            theme="accent"
            disabled={pesando.gramas <= 0}
            onPress={() => {
              setQty(pesando.itemId, gramasToQuantidade(pesando.gramas));
              setPesando(null);
            }}
          >
            Salvar peso
          </Button>
        </XStack>
      </YStack>
    );
  }

  return (
    <YStack flex={1}>
      <ScrollView flex={1} contentContainerStyle={{ p: '$3', gap: '$3', pb: '$10' }}>
        <TotalBar budget={budget} itemCount={lines.length} />

        <XStack items="center" justify="space-between" p="$2">
          <Paragraph size="$3">Cartão da loja</Paragraph>
          <Button size="$3" theme={trip.useStoreCard === 1 ? 'accent' : undefined} onPress={toggleStoreCard}>
            {trip.useStoreCard === 1 ? 'usando' : 'não uso'}
          </Button>
        </XStack>

        {lines.length === 0 ? (
          <YStack items="center" gap="$2" p="$6">
            <Paragraph color="$color10" text="center">
              Nenhum item ainda. Aponte a câmera para a etiqueta na gôndola.
            </Paragraph>
          </YStack>
        ) : null}

        {lines.map((line) => (
          <YStack key={line.row.id} gap="$2" p="$3" bg="$color2" rounded="$4">
            <XStack justify="space-between" items="flex-start" gap="$2">
              <Paragraph flex={1} size="$4" fontWeight="700">
                {line.row.rawName}
              </Paragraph>
              <Paragraph size="$5" fontWeight="900">
                {formatCents(line.row.totalCents)}
              </Paragraph>
            </XStack>

            <Paragraph size="$2" color="$color10">
              {formatQuantity(line.row.qty, line.row.saleUnit)} ×{' '}
              {formatCents(line.row.unitPriceCents)}
              {line.row.unitPriceCents < line.policy.basePriceCents
                ? ` · faixa aplicada (de ${formatCents(line.policy.basePriceCents)})`
                : ''}
            </Paragraph>

            <QuantityStepper
              quantity={line.row.qty}
              saleUnit={line.row.saleUnit as 'UN' | 'KG' | 'L' | 'M'}
              hint={line.hint}
              onChange={(qty) => setQty(line.row.id, qty)}
              onEditWeight={() =>
                setPesando({ itemId: line.row.id, gramas: Math.round(line.row.qty * 1000) })
              }
            />

            <XStack justify="flex-end">
              <Button size="$2" onPress={() => remove(line.row.id)}>
                Remover
              </Button>
            </XStack>
          </YStack>
        ))}

        <Separator />
        <Button onPress={() => router.push('/summary')}>Finalizar compra</Button>
      </ScrollView>

      <YStack position="absolute" b={0} l={0} r={0} gap="$2" p="$3" bg="$background">
        {lastAddedId ? (
          <Button size="$3" onPress={undoLastAdd}>
            Desfazer último item
          </Button>
        ) : null}
        <Button size="$6" theme="accent" onPress={() => router.push('/scan')}>
          Escanear etiqueta
        </Button>
      </YStack>
    </YStack>
  );
}

/** Gramas → unidade base. Extraído para o handler ficar legível. */
function gramasToQuantidade(gramas: number): number {
  return gramsToQuantity(gramas);
}
