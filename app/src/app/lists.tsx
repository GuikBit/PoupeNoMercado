/**
 * Listas de compras: criar, abrir, editar, reordenar, marcar e definir o TETO.
 *
 * O teto de gasto pertence à lista: a compra iniciada por ela herda o valor,
 * então o mesmo teto vale toda vez que a lista é usada, sem redigitar.
 *
 * Agrupamento: **pendentes primeiro, comprados no fim**. Durante a compra o
 * que importa é o que falta; ordem de cadastro só interessa na hora de montar
 * a lista, e para isso existem as setas.
 *
 * ⚠️ Teclado: as ScrollViews usam `keyboardShouldPersistTaps="handled"`. Sem
 * isso, com o teclado aberto o primeiro toque em qualquer botão só fecha o
 * teclado e o botão não dispara — parece que travou.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';
import { Button, Input, Paragraph, ScrollView, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import type { ListItemRow } from '../db/schema';
import { useListStore } from '../state/listStore';
import { useTripStore } from '../state/tripStore';
import { NumericPad } from '../trip/NumericPad';
import { Eyebrow, TABULAR } from '../ui/kit';
import { formatCents } from '../ui/money';

export default function ListsScreen() {
  const router = useRouter();
  const ctx = useMemo(() => appRepoContext(), []);
  const {
    lists,
    items,
    openListId,
    attach,
    open,
    create,
    remove,
    addItem,
    toggle,
    removeItem,
    move,
    setBudget,
  } = useListStore();
  const startTrip = useTripStore((s) => s.start);
  const attachTrip = useTripStore((s) => s.attach);
  const tripAtiva = useTripStore((s) => s.trip);

  const [novaLista, setNovaLista] = useState('');
  const [novoItem, setNovoItem] = useState('');
  const [editandoTeto, setEditandoTeto] = useState<{ listId: string; cents: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      attach(ctx);
      attachTrip(ctx);
    }, [attach, attachTrip, ctx]),
  );

  /** Fecha o teclado antes de agir — manter aberto depois de confirmar
      esconde metade da tela. */
  function agir(acao: () => void) {
    Keyboard.dismiss();
    acao();
  }

  const listaAberta = lists.find((l) => l.id === openListId) ?? null;

  if (editandoTeto) {
    const lista = lists.find((l) => l.id === editandoTeto.listId);
    return (
      <YStack flex={1} gap="$3" p="$4">
        <YStack gap="$1">
          <Eyebrow>Teto de gasto</Eyebrow>
          <Paragraph size="$6" fontWeight="700">
            {lista?.name ?? ''}
          </Paragraph>
          <Paragraph size="$2" color="$color10">
            Toda compra iniciada por esta lista já começa com este teto.
          </Paragraph>
        </YStack>
        <NumericPad
          label="Teto de gasto"
          valueCents={editandoTeto.cents}
          onChange={(cents) => setEditandoTeto({ ...editandoTeto, cents })}
        />
        <XStack gap="$2">
          <Button flex={1} onPress={() => setEditandoTeto(null)}>
            Cancelar
          </Button>
          <Button
            flex={1}
            onPress={() => {
              setBudget(editandoTeto.listId, null);
              setEditandoTeto(null);
            }}
          >
            Sem teto
          </Button>
          <Button
            flex={2}
            theme="accent"
            disabled={editandoTeto.cents <= 0}
            onPress={() => {
              setBudget(editandoTeto.listId, editandoTeto.cents);
              setEditandoTeto(null);
            }}
          >
            Salvar
          </Button>
        </XStack>
      </YStack>
    );
  }

  if (listaAberta) {
    const pendentes = items.filter((i) => i.checked === 0);
    const comprados = items.filter((i) => i.checked === 1);
    const progresso = items.length === 0 ? 0 : comprados.length / items.length;

    const linha = (item: ListItemRow, index: number, total: number, comprado: boolean) => (
      <XStack
        key={item.id}
        items="center"
        gap="$2"
        px="$3"
        py="$2"
        borderTopWidth={index === 0 ? 0 : 1}
        borderColor="$color4"
      >
        <YStack
          width={24}
          height={24}
          rounded="$10"
          items="center"
          justify="center"
          borderWidth={2}
          borderColor={comprado ? '$green10' : '$color8'}
          bg={comprado ? '$green10' : 'transparent'}
          onPress={() => agir(() => toggle(item.id, !comprado))}
          pressStyle={{ opacity: 0.6 }}
        >
          {comprado ? (
            <Paragraph size="$1" color="white" fontWeight="900">
              ✓
            </Paragraph>
          ) : null}
        </YStack>

        <Paragraph
          flex={1}
          size="$4"
          textDecorationLine={comprado ? 'line-through' : 'none'}
          color={comprado ? '$color10' : undefined}
          onPress={() => agir(() => toggle(item.id, !comprado))}
        >
          {item.name}
        </Paragraph>

        {comprado ? null : (
          <>
            <Button size="$2" chromeless disabled={index === 0} onPress={() => agir(() => move(item.id, -1))}>
              ↑
            </Button>
            <Button
              size="$2"
              chromeless
              disabled={index === total - 1}
              onPress={() => agir(() => move(item.id, 1))}
            >
              ↓
            </Button>
          </>
        )}
        <Button size="$2" chromeless color="$color10" onPress={() => agir(() => removeItem(item.id))}>
          ×
        </Button>
      </XStack>
    );

    return (
      <YStack flex={1}>
        <ScrollView
          flex={1}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ p: '$3', gap: '$4', pb: 180 }}
        >
          <YStack gap="$3" p="$4" bg="$color2" rounded="$6">
            <XStack items="flex-start" justify="space-between" gap="$2">
              <YStack flex={1} gap="$1">
                <Eyebrow>Lista</Eyebrow>
                <Paragraph size="$7" fontWeight="800" lineHeight={28}>
                  {listaAberta.name}
                </Paragraph>
              </YStack>
              <Button size="$2" onPress={() => agir(() => open(null))}>
                Fechar
              </Button>
            </XStack>

            <XStack items="center" justify="space-between" gap="$2">
              <YStack>
                <Eyebrow>Teto</Eyebrow>
                <Paragraph size="$6" fontWeight="900" {...TABULAR}>
                  {listaAberta.budgetCents ? formatCents(listaAberta.budgetCents) : 'sem teto'}
                </Paragraph>
              </YStack>
              <Button
                size="$3"
                onPress={() =>
                  agir(() =>
                    setEditandoTeto({
                      listId: listaAberta.id,
                      cents: listaAberta.budgetCents ?? 0,
                    }),
                  )
                }
              >
                {listaAberta.budgetCents ? 'Alterar' : 'Definir'}
              </Button>
            </XStack>

            {items.length > 0 ? (
              <YStack gap="$2">
                <YStack height={6} bg="$color5" rounded="$10" overflow="hidden">
                  <YStack height={6} width={`${progresso * 100}%`} bg="$green10" rounded="$10" />
                </YStack>
                <Paragraph size="$2" color="$color10" {...TABULAR}>
                  {`${comprados.length} de ${items.length} no carrinho`}
                </Paragraph>
              </YStack>
            ) : null}
          </YStack>

          <XStack gap="$2">
            <Input
              flex={1}
              size="$4"
              placeholder="O que falta comprar?"
              value={novoItem}
              onChangeText={setNovoItem}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (novoItem.trim()) addItem(novoItem.trim());
                setNovoItem('');
              }}
            />
            <Button
              size="$4"
              theme="accent"
              disabled={!novoItem.trim()}
              onPress={() =>
                agir(() => {
                  addItem(novoItem.trim());
                  setNovoItem('');
                })
              }
            >
              Adicionar
            </Button>
          </XStack>

          {items.length === 0 ? (
            <YStack items="center" gap="$2" py="$6">
              <Paragraph size="$5" fontWeight="700" text="center">
                Lista vazia
              </Paragraph>
              <Paragraph color="$color10" text="center" maxW={280}>
                Escreva o que precisa comprar. Na compra, escanear a etiqueta marca o item sozinho.
              </Paragraph>
            </YStack>
          ) : null}

          {pendentes.length > 0 ? (
            <YStack gap="$2">
              <Eyebrow count={pendentes.length}>Falta pegar</Eyebrow>
              <YStack bg="$color2" rounded="$6" overflow="hidden">
                {pendentes.map((item, i) => linha(item, i, pendentes.length, false))}
              </YStack>
            </YStack>
          ) : null}

          {comprados.length > 0 ? (
            <YStack gap="$2">
              <Eyebrow count={comprados.length}>Já no carrinho</Eyebrow>
              <YStack bg="$color2" rounded="$6" overflow="hidden" opacity={0.7}>
                {comprados.map((item, i) => linha(item, i, comprados.length, true))}
              </YStack>
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
          {tripAtiva ? (
            <>
              <Paragraph size="$2" color="$color10" text="center">
                Já existe uma compra em andamento. Finalize-a para começar outra.
              </Paragraph>
              <Button size="$5" theme="accent" onPress={() => agir(() => router.push('/trip'))}>
                Ir para a compra em andamento
              </Button>
            </>
          ) : (
            <Button
              size="$6"
              theme="accent"
              onPress={() =>
                agir(() => {
                  startTrip({ listId: listaAberta.id, budgetCents: listaAberta.budgetCents });
                  router.push('/trip');
                })
              }
            >
              {listaAberta.budgetCents
                ? `Iniciar compra · teto ${formatCents(listaAberta.budgetCents)}`
                : 'Iniciar compra com esta lista'}
            </Button>
          )}
        </YStack>
      </YStack>
    );
  }

  return (
    <ScrollView
      flex={1}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ p: '$3', gap: '$3' }}
    >
      <XStack gap="$2">
        <Input
          flex={1}
          size="$4"
          placeholder="Nome da nova lista"
          value={novaLista}
          onChangeText={setNovaLista}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (novaLista.trim()) create(novaLista.trim());
            setNovaLista('');
          }}
        />
        <Button
          size="$4"
          theme="accent"
          disabled={!novaLista.trim()}
          onPress={() =>
            agir(() => {
              create(novaLista.trim());
              setNovaLista('');
            })
          }
        >
          Criar
        </Button>
      </XStack>

      {lists.length === 0 ? (
        <YStack items="center" gap="$2" py="$8">
          <Paragraph size="$5" fontWeight="700" text="center">
            Nenhuma lista ainda
          </Paragraph>
          <Paragraph color="$color10" text="center" maxW={280}>
            Crie uma lista para definir o teto de gasto — ou faça uma compra rápida pela tela
            inicial, sem lista.
          </Paragraph>
        </YStack>
      ) : null}

      {lists.map((lista) => (
        <XStack
          key={lista.id}
          items="center"
          gap="$2"
          p="$4"
          bg="$color2"
          rounded="$6"
          onPress={() => agir(() => open(lista.id))}
          pressStyle={{ bg: '$color4' }}
        >
          <YStack flex={1} gap="$1">
            <Paragraph size="$6" fontWeight="700">
              {lista.name}
            </Paragraph>
            <Paragraph size="$2" color="$color10" {...TABULAR}>
              {lista.budgetCents ? `teto ${formatCents(lista.budgetCents)}` : 'sem teto'}
            </Paragraph>
          </YStack>
          <Button size="$2" chromeless color="$color10" onPress={() => agir(() => remove(lista.id))}>
            ×
          </Button>
        </XStack>
      ))}
    </ScrollView>
  );
}
