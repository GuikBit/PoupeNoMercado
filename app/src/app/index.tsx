/**
 * Home: retoma a compra em andamento ou começa uma nova.
 *
 * A compra ativa vem primeiro na tela porque é o estado em que o app é
 * realmente usado — de pé, no corredor. Configurar orçamento é o caminho
 * secundário.
 */
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Button, H3, Paragraph, Separator, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { useTripStore } from '../state/tripStore';
import { NumericPad } from '../trip/NumericPad';
import { formatCents } from '../ui/money';

export default function Home() {
  const router = useRouter();
  const ctx = useMemo(() => appRepoContext(), []);
  const { trip, budget, lines, attach, start, abandon } = useTripStore();
  const [budgetCents, setBudgetCents] = useState(0);
  const [definindoTeto, setDefinindoTeto] = useState(false);

  useFocusEffect(
    useCallback(() => {
      attach(ctx);
    }, [attach, ctx]),
  );

  function iniciar() {
    start({ budgetCents: budgetCents > 0 ? budgetCents : null });
    setDefinindoTeto(false);
    setBudgetCents(0);
    router.push('/trip');
  }

  if (trip) {
    return (
      <YStack flex={1} gap="$4" p="$4">
        <YStack gap="$1">
          <Paragraph size="$2" color="$color10">
            Compra em andamento
          </Paragraph>
          <Paragraph size="$9" fontWeight="900">
            {formatCents(budget.spentCents)}
          </Paragraph>
          <Paragraph size="$3" color="$color10">
            {`${lines.length} ${lines.length === 1 ? 'item' : 'itens'}`}
          </Paragraph>
        </YStack>

        <Link href="/trip" asChild>
          <Button size="$6" theme="accent">
            Continuar compra
          </Button>
        </Link>

        {/* Estes caminhos precisam existir MESMO com compra aberta: sem eles o
            usuário fica preso na compra, sem chegar às listas nem ao Lab. */}
        <Link href="/lists" asChild>
          <Button size="$5">Minhas listas</Button>
        </Link>

        <Separator />
        <Button
          size="$3"
          onPress={() => {
            abandon();
            setDefinindoTeto(false);
          }}
        >
          Abandonar esta compra
        </Button>
        <Link href="/lab" asChild>
          <Button size="$3">Laboratório de Etiquetas</Button>
        </Link>
      </YStack>
    );
  }

  if (definindoTeto) {
    return (
      <YStack flex={1} gap="$3" p="$4">
        <H3>Quanto você pode gastar?</H3>
        <NumericPad
          label="Teto da compra"
          valueCents={budgetCents}
          onChange={setBudgetCents}
        />
        <XStack gap="$2">
          <Button flex={1} onPress={() => setDefinindoTeto(false)}>
            Voltar
          </Button>
          <Button flex={2} theme="accent" onPress={iniciar}>
            Começar
          </Button>
        </XStack>
      </YStack>
    );
  }

  return (
    <YStack flex={1} justify="center" gap="$4" p="$4">
      <YStack gap="$2">
        <H3>Poupe no Mercado</H3>
        <Paragraph color="$color10">
          Aponte para a etiqueta, confirme o preço, e veja o total crescer. Nunca seja
          surpreendido no caixa.
        </Paragraph>
      </YStack>

      <Button size="$6" theme="accent" onPress={() => setDefinindoTeto(true)}>
        Iniciar compra com teto
      </Button>
      <Button size="$5" onPress={iniciar}>
        Iniciar sem teto
      </Button>
      <Link href="/lists" asChild>
        <Button size="$5">Minhas listas</Button>
      </Link>

      <Separator />
      <Link href="/lab" asChild>
        <Button size="$3">Laboratório de Etiquetas</Button>
      </Link>
    </YStack>
  );
}
