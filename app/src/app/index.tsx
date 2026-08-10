/**
 * Home: retoma a compra em andamento, ou entra pela lista.
 *
 * ⚠️ Hierarquia: **o teto de gasto pertence à LISTA**, não à compra. Quem quer
 * comprar com teto define o teto na lista e inicia a compra por ela; a compra
 * herda o valor. A "compra rápida" existe para a ida de três itens e não tem
 * teto — se tivesse, haveria dois lugares para definir a mesma coisa.
 */
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Button, H3, Paragraph, Separator, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { loadSettings } from '../db/repositories/settingsRepo';
import { useTripStore } from '../state/tripStore';
import { formatCents } from '../ui/money';

export default function Home() {
  const router = useRouter();
  const ctx = useMemo(() => appRepoContext(), []);
  const { trip, budget, lines, attach, start, abandon } = useTripStore();

  useFocusEffect(
    useCallback(() => {
      attach(ctx);
    }, [attach, ctx]),
  );

  function compraRapida() {
    start({
      budgetCents: null,
      useStoreCard: loadSettings(ctx.db).defaultUseStoreCard,
    });
    router.push('/trip');
  }

  if (trip) {
    return (
      <YStack flex={1} gap="$3" p="$4">
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
        <Link href="/history" asChild>
          <Button size="$5">Histórico</Button>
        </Link>

        <Separator />
        <Button size="$3" onPress={abandon}>
          Abandonar esta compra
        </Button>
        <Link href="/settings" asChild>
          <Button size="$3">Configurações</Button>
        </Link>
        <Link href="/lab" asChild>
          <Button size="$3">Laboratório de Etiquetas</Button>
        </Link>
      </YStack>
    );
  }

  return (
    <YStack flex={1} justify="center" gap="$3" p="$4">
      <YStack gap="$2">
        <H3>Poupe no Mercado</H3>
        <Paragraph color="$color10">
          Aponte para a etiqueta, confirme o preço, e veja o total crescer. Nunca seja
          surpreendido no caixa.
        </Paragraph>
      </YStack>

      <Link href="/lists" asChild>
        <Button size="$6" theme="accent">
          Minhas listas
        </Button>
      </Link>
      <Paragraph size="$2" color="$color10" text="center">
        O teto de gasto fica na lista — defina lá e a compra herda.
      </Paragraph>

      <Button size="$5" onPress={compraRapida}>
        Compra rápida, sem lista
      </Button>

      <Separator />
      <Link href="/history" asChild>
        <Button size="$3">Histórico</Button>
      </Link>
      <Link href="/settings" asChild>
        <Button size="$3">Configurações</Button>
      </Link>
      <Link href="/lab" asChild>
        <Button size="$3">Laboratório de Etiquetas</Button>
      </Link>
    </YStack>
  );
}
