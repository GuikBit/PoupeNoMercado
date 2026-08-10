/**
 * Listas de compras: criar, abrir, editar, reordenar e marcar.
 *
 * A lista existe para dois fins: lembrar o que comprar e, durante a compra,
 * ser marcada sozinha quando a etiqueta escaneada casa com um item (docs/02 §8).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Button, Input, Paragraph, ScrollView, Separator, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { useListStore } from '../state/listStore';
import { useTripStore } from '../state/tripStore';

export default function ListsScreen() {
  const router = useRouter();
  const ctx = useMemo(() => appRepoContext(), []);
  const { lists, items, openListId, attach, open, create, remove, addItem, toggle, removeItem, move } =
    useListStore();
  const startTrip = useTripStore((s) => s.start);
  const attachTrip = useTripStore((s) => s.attach);

  const [novaLista, setNovaLista] = useState('');
  const [novoItem, setNovoItem] = useState('');

  useFocusEffect(
    useCallback(() => {
      attach(ctx);
      attachTrip(ctx);
    }, [attach, attachTrip, ctx]),
  );

  const listaAberta = lists.find((l) => l.id === openListId) ?? null;

  if (listaAberta) {
    const pendentes = items.filter((i) => i.checked === 0).length;
    return (
      <YStack flex={1}>
        <ScrollView flex={1} contentContainerStyle={{ p: '$3', gap: '$2', pb: '$10' }}>
          <XStack items="center" justify="space-between">
            <Paragraph size="$6" fontWeight="700">
              {listaAberta.name}
            </Paragraph>
            <Button size="$2" onPress={() => open(null)}>
              Fechar
            </Button>
          </XStack>
          <Paragraph size="$2" color="$color10">
            {`${pendentes} de ${items.length} pendentes`}
          </Paragraph>

          <XStack gap="$2">
            <Input
              flex={1}
              placeholder="Adicionar item"
              value={novoItem}
              onChangeText={setNovoItem}
              onSubmitEditing={() => {
                if (novoItem.trim()) addItem(novoItem.trim());
                setNovoItem('');
              }}
            />
            <Button
              disabled={!novoItem.trim()}
              onPress={() => {
                addItem(novoItem.trim());
                setNovoItem('');
              }}
            >
              +
            </Button>
          </XStack>

          {items.length === 0 ? (
            <YStack items="center" p="$6">
              <Paragraph color="$color10" text="center">
                Lista vazia. Escreva o que você precisa comprar — durante a compra, escanear a
                etiqueta marca o item sozinho.
              </Paragraph>
            </YStack>
          ) : null}

          {items.map((item, index) => (
            <XStack key={item.id} items="center" gap="$2" p="$2" bg="$color2" rounded="$4">
              <Button
                size="$3"
                circular
                theme={item.checked === 1 ? 'accent' : undefined}
                onPress={() => toggle(item.id, item.checked === 0)}
              >
                {item.checked === 1 ? '✓' : ' '}
              </Button>
              <Paragraph
                flex={1}
                size="$4"
                textDecorationLine={item.checked === 1 ? 'line-through' : 'none'}
                color={item.checked === 1 ? '$color10' : undefined}
              >
                {item.name}
              </Paragraph>
              <Button size="$2" disabled={index === 0} onPress={() => move(item.id, -1)}>
                ↑
              </Button>
              <Button
                size="$2"
                disabled={index === items.length - 1}
                onPress={() => move(item.id, 1)}
              >
                ↓
              </Button>
              <Button size="$2" onPress={() => removeItem(item.id)}>
                ×
              </Button>
            </XStack>
          ))}
        </ScrollView>

        <YStack position="absolute" b={0} l={0} r={0} p="$3" bg="$background">
          <Button
            size="$6"
            theme="accent"
            onPress={() => {
              startTrip({ listId: listaAberta.id, budgetCents: listaAberta.budgetCents });
              router.push('/trip');
            }}
          >
            Iniciar compra com esta lista
          </Button>
        </YStack>
      </YStack>
    );
  }

  return (
    <ScrollView flex={1} contentContainerStyle={{ p: '$3', gap: '$3' }}>
      <XStack gap="$2">
        <Input
          flex={1}
          placeholder="Nova lista"
          value={novaLista}
          onChangeText={setNovaLista}
          onSubmitEditing={() => {
            if (novaLista.trim()) create(novaLista.trim());
            setNovaLista('');
          }}
        />
        <Button
          disabled={!novaLista.trim()}
          onPress={() => {
            create(novaLista.trim());
            setNovaLista('');
          }}
        >
          Criar
        </Button>
      </XStack>

      <Separator />

      {lists.length === 0 ? (
        <YStack items="center" p="$6">
          <Paragraph color="$color10" text="center">
            Nenhuma lista ainda. Criar uma é opcional — dá para comprar sem lista.
          </Paragraph>
        </YStack>
      ) : null}

      {lists.map((lista) => (
        <XStack key={lista.id} items="center" gap="$2" p="$3" bg="$color2" rounded="$4">
          <Paragraph flex={1} size="$5" onPress={() => open(lista.id)}>
            {lista.name}
          </Paragraph>
          <Button size="$2" onPress={() => open(lista.id)}>
            Abrir
          </Button>
          <Button size="$2" onPress={() => remove(lista.id)}>
            ×
          </Button>
        </XStack>
      ))}
    </ScrollView>
  );
}
