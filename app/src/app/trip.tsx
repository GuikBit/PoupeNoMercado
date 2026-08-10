/**
 * Compra ativa — a tela onde o app vive.
 *
 * Ordem da tela = ordem da pergunta que a pessoa faz no corredor:
 *   1. "quanto já deu?"        → total e barra de orçamento
 *   2. "o que já peguei?"      → NA SACOLA
 *   3. "o que ainda falta?"    → FALTA PEGAR (itens da lista não marcados)
 *
 * O rodapé é fixo porque escanear se repete dezenas de vezes por compra e
 * "Finalizar" precisa estar sempre ao alcance — deixá-lo no fim da rolagem o
 * tornava inacessível numa compra grande.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Button, Paragraph, ScrollView, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { useTripStore } from '../state/tripStore';
import { NumericPad } from '../trip/NumericPad';
import { TotalBar } from '../trip/TotalBar';
import { TripItemCard } from '../trip/TripItemCard';
import { Eyebrow } from '../ui/kit';
import { formatQuantity, gramsToQuantity } from '../ui/money';
import { useKeepAwakeDuringTrip } from '../ui/useKeepAwake';

export default function TripScreen() {
  const router = useRouter();
  const ctx = useMemo(() => appRepoContext(), []);
  const {
    trip,
    lines,
    budget,
    pending,
    attach,
    setQty,
    remove,
    toggleStoreCard,
    checkPending,
    undoLastAdd,
    lastAddedId,
  } = useTripStore();
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
              setQty(pesando.itemId, gramsToQuantity(pesando.gramas));
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
      <ScrollView
        flex={1}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ p: '$3', gap: '$4', pb: 190 }}
      >
        <TotalBar budget={budget} itemCount={lines.length} />

        <XStack items="center" justify="space-between" px="$1">
          <Paragraph size="$3" color="$color10">
            Cartão da loja
          </Paragraph>
          <Button
            size="$3"
            theme={trip.useStoreCard === 1 ? 'accent' : undefined}
            onPress={toggleStoreCard}
          >
            {trip.useStoreCard === 1 ? 'usando' : 'não uso'}
          </Button>
        </XStack>

        {lines.length === 0 ? (
          <YStack items="center" gap="$2" py="$6">
            <Paragraph size="$5" fontWeight="700" text="center">
              Nada na sacola ainda
            </Paragraph>
            <Paragraph color="$color10" text="center" maxW={280}>
              Aponte a câmera para a etiqueta na gôndola. O preço entra aqui e o total sobe na hora.
            </Paragraph>
          </YStack>
        ) : (
          <YStack gap="$2">
            <Eyebrow count={lines.length}>Na sacola</Eyebrow>
            {lines.map((line) => (
              <TripItemCard
                key={line.row.id}
                line={line}
                onQty={(qty) => setQty(line.row.id, qty)}
                onRemove={() => remove(line.row.id)}
                onEditWeight={() =>
                  setPesando({ itemId: line.row.id, gramas: Math.round(line.row.qty * 1000) })
                }
              />
            ))}
          </YStack>
        )}

        {/* O que ainda falta. Só existe quando a compra veio de uma lista —
            é a lista de compras vista de dentro do corredor. */}
        {pending.length > 0 ? (
          <YStack gap="$2">
            <Eyebrow count={pending.length}>Falta pegar</Eyebrow>
            <YStack rounded="$6" overflow="hidden" bg="$color2">
              {pending.map((item, index) => (
                <XStack
                  key={item.id}
                  items="center"
                  gap="$3"
                  px="$3"
                  py="$3"
                  borderTopWidth={index === 0 ? 0 : 1}
                  borderColor="$color4"
                  onPress={() => checkPending(item.id)}
                  pressStyle={{ bg: '$color4' }}
                >
                  <YStack
                    width={22}
                    height={22}
                    rounded="$10"
                    borderWidth={2}
                    borderColor="$color8"
                  />
                  <Paragraph flex={1} size="$4">
                    {item.name}
                  </Paragraph>
                </XStack>
              ))}
            </YStack>
            <Paragraph size="$1" color="$color10" px="$1">
              Escanear marca sozinho. Toque para marcar sem escanear.
            </Paragraph>
          </YStack>
        ) : null}
      </ScrollView>

      <YStack
        position="absolute"
        b={0}
        l={0}
        r={0}
        gap="$2"
        p="$3"
        bg="$background"
        borderTopWidth={1}
        borderColor="$color4"
      >
        {lastAddedId ? (
          <Button size="$3" chromeless color="$color10" onPress={undoLastAdd}>
            Desfazer último item
          </Button>
        ) : null}
        <XStack gap="$2">
          <Button flex={1} size="$6" onPress={() => router.push('/summary')}>
            Finalizar
          </Button>
          <Button flex={2} size="$6" theme="accent" onPress={() => router.push('/scan')}>
            Escanear etiqueta
          </Button>
        </XStack>
      </YStack>
    </YStack>
  );
}
