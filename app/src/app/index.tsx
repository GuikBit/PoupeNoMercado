/**
 * Home: retoma a compra em andamento, ou entra pela lista.
 *
 * ⚠️ Hierarquia: **o teto de gasto pertence à LISTA**, não à compra. Quem quer
 * comprar com teto define o teto na lista e inicia a compra por ela; a compra
 * herda o valor. A "compra rápida" existe para a ida de três itens e não tem
 * teto — se tivesse, haveria dois lugares para definir a mesma coisa.
 *
 * Só existe UMA ação em destaque por estado — continuar a compra, ou abrir as
 * listas. As utilidades (histórico, configurações, laboratório) vão para um
 * rodapé discreto: com tudo em botão cheio, sete ações competiam pelo mesmo
 * olhar e nenhuma vencia.
 */
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Button, H2, Paragraph, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { loadSettings } from '../db/repositories/settingsRepo';
import { useTripStore } from '../state/tripStore';
import { Eyebrow, Money } from '../ui/kit';
import { formatCents } from '../ui/money';

/** Utilidades. Sempre acessíveis, nunca disputando atenção com a compra. */
function RodapeUtilidades({ children }: { children?: ReactNode }) {
  return (
    <YStack gap="$2" borderTopWidth={1} borderColor="$color4" pt="$3">
      {children}
      <XStack gap="$2">
        <Link href="/history" asChild>
          <Button flex={1} size="$3" chromeless color="$color10">
            Histórico
          </Button>
        </Link>
        <Link href="/settings" asChild>
          <Button flex={1} size="$3" chromeless color="$color10">
            Configurações
          </Button>
        </Link>
        <Link href="/lab" asChild>
          <Button flex={1} size="$3" chromeless color="$color10">
            Laboratório
          </Button>
        </Link>
      </XStack>
    </YStack>
  );
}

export default function Home() {
  const router = useRouter();
  const ctx = useMemo(() => appRepoContext(), []);
  const { trip, budget, lines, attach, start, abandon } = useTripStore();
  /** Abandonar joga a compra fora. Um toque só era perto demais do desastre. */
  const [confirmandoAbandono, setConfirmandoAbandono] = useState(false);

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
        <YStack gap="$1" p="$4" bg="$color2" rounded="$6">
          <Eyebrow>Compra em andamento</Eyebrow>
          <Money cents={budget.spentCents} format={formatCents} size="$10" />
          <Paragraph size="$3" color="$color10">
            {`${lines.length} ${lines.length === 1 ? 'item' : 'itens'}`}
          </Paragraph>
        </YStack>

        <Link href="/trip" asChild>
          <Button size="$6" theme="accent">
            Continuar compra
          </Button>
        </Link>

        {/* Este caminho precisa existir MESMO com compra aberta: sem ele o
            usuário fica preso na compra e não chega às listas. */}
        <Link href="/lists" asChild>
          <Button size="$4">Minhas listas</Button>
        </Link>

        <YStack flex={1} />

        <RodapeUtilidades>
          {confirmandoAbandono ? (
            <XStack items="center" gap="$2">
              <Paragraph flex={1} size="$2" color="$color10">
                {`Descartar os ${lines.length} ${lines.length === 1 ? 'item' : 'itens'} desta compra?`}
              </Paragraph>
              <Button size="$2" chromeless onPress={() => setConfirmandoAbandono(false)}>
                Não
              </Button>
              <Button
                size="$2"
                theme="red"
                onPress={() => {
                  abandon();
                  setConfirmandoAbandono(false);
                }}
              >
                Descartar
              </Button>
            </XStack>
          ) : (
            <Button
              size="$3"
              chromeless
              color="$color10"
              onPress={() => setConfirmandoAbandono(true)}
            >
              Abandonar esta compra
            </Button>
          )}
        </RodapeUtilidades>
      </YStack>
    );
  }

  return (
    <YStack flex={1} gap="$3" p="$4">
      <YStack flex={1} justify="center" gap="$4">
        <YStack gap="$2">
          <H2 lineHeight={34}>Nunca seja surpreendido no caixa.</H2>
          <Paragraph color="$color10">
            Aponte para a etiqueta na gôndola, confirme o preço, e veja o total crescer enquanto
            você compra.
          </Paragraph>
        </YStack>

        <YStack gap="$2">
          <Link href="/lists" asChild>
            <Button size="$6" theme="accent">
              Minhas listas
            </Button>
          </Link>
          <Paragraph size="$2" color="$color10" text="center">
            O teto de gasto fica na lista — defina lá e a compra herda.
          </Paragraph>
        </YStack>

        <Button size="$4" onPress={compraRapida}>
          Compra rápida, sem lista
        </Button>
      </YStack>

      <RodapeUtilidades />
    </YStack>
  );
}
