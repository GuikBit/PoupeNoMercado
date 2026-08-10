/**
 * Listas de compras: criar, abrir, editar, reordenar, marcar e definir o TETO.
 *
 * O teto de gasto pertence à lista (e não à compra): a compra iniciada a
 * partir dela herda o valor, então o mesmo teto vale toda vez que a lista é
 * usada, sem redigitar.
 *
 * ⚠️ Teclado: as ScrollViews usam `keyboardShouldPersistTaps="handled"`. Sem
 * isso, com o teclado aberto o primeiro toque em qualquer botão só fecha o
 * teclado e o botão não dispara — o usuário precisa tocar duas vezes e acha
 * que travou. Toda ação também fecha o teclado explicitamente.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';
import { Button, Input, Paragraph, ScrollView, Separator, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { useListStore } from '../state/listStore';
import { useTripStore } from '../state/tripStore';
import { NumericPad } from '../trip/NumericPad';
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

  /** Fecha o teclado antes de agir — o toque já não é engolido, mas manter o
      teclado aberto depois de confirmar esconde metade da tela. */
  function agir(acao: () => void) {
    Keyboard.dismiss();
    acao();
  }

  const listaAberta = lists.find((l) => l.id === openListId) ?? null;

  if (editandoTeto) {
    const lista = lists.find((l) => l.id === editandoTeto.listId);
    return (
      <YStack flex={1} gap="$3" p="$4">
        <Paragraph size="$5" fontWeight="700">
          {`Teto de "${lista?.name ?? ''}"`}
        </Paragraph>
        <Paragraph size="$2" color="$color10">
          Toda compra iniciada por esta lista já começa com este teto.
        </Paragraph>
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
    const pendentes = items.filter((i) => i.checked === 0).length;
    return (
      <YStack flex={1}>
        <ScrollView
          flex={1}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ p: '$3', gap: '$2', pb: 180 }}
        >
          <XStack items="center" justify="space-between">
            <Paragraph size="$6" fontWeight="700">
              {listaAberta.name}
            </Paragraph>
            <Button size="$2" onPress={() => agir(() => open(null))}>
              Fechar
            </Button>
          </XStack>

          <XStack items="center" justify="space-between" p="$3" bg="$color2" rounded="$4">
            <YStack flex={1}>
              <Paragraph size="$2" color="$color10">
                Teto de gasto
              </Paragraph>
              <Paragraph size="$6" fontWeight="900">
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

          <Paragraph size="$2" color="$color10">
            {`${pendentes} de ${items.length} pendentes`}
          </Paragraph>

          <XStack gap="$2">
            <Input
              flex={1}
              placeholder="Adicionar item"
              value={novoItem}
              onChangeText={setNovoItem}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (novoItem.trim()) addItem(novoItem.trim());
                setNovoItem('');
              }}
            />
            <Button
              disabled={!novoItem.trim()}
              onPress={() =>
                agir(() => {
                  addItem(novoItem.trim());
                  setNovoItem('');
                })
              }
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
                onPress={() => agir(() => toggle(item.id, item.checked === 0))}
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
              <Button size="$2" disabled={index === 0} onPress={() => agir(() => move(item.id, -1))}>
                ↑
              </Button>
              <Button
                size="$2"
                disabled={index === items.length - 1}
                onPress={() => agir(() => move(item.id, 1))}
              >
                ↓
              </Button>
              <Button size="$2" onPress={() => agir(() => removeItem(item.id))}>
                ×
              </Button>
            </XStack>
          ))}
        </ScrollView>

        <YStack position="absolute" b={0} l={0} r={0} gap="$2" p="$3" bg="$background">
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
          placeholder="Nova lista"
          value={novaLista}
          onChangeText={setNovaLista}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (novaLista.trim()) create(novaLista.trim());
            setNovaLista('');
          }}
        />
        <Button
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

      <Separator />

      {lists.length === 0 ? (
        <YStack items="center" p="$6">
          <Paragraph color="$color10" text="center">
            Nenhuma lista ainda. Crie uma para definir o teto de gasto — ou faça uma compra rápida
            sem lista pela tela inicial.
          </Paragraph>
        </YStack>
      ) : null}

      {lists.map((lista) => (
        <XStack key={lista.id} items="center" gap="$2" p="$3" bg="$color2" rounded="$4">
          <YStack flex={1} onPress={() => agir(() => open(lista.id))}>
            <Paragraph size="$5">{lista.name}</Paragraph>
            <Paragraph size="$2" color="$color10">
              {lista.budgetCents ? `teto ${formatCents(lista.budgetCents)}` : 'sem teto'}
            </Paragraph>
          </YStack>
          <Button size="$2" onPress={() => agir(() => open(lista.id))}>
            Abrir
          </Button>
          <Button size="$2" onPress={() => agir(() => remove(lista.id))}>
            ×
          </Button>
        </XStack>
      ))}
    </ScrollView>
  );
}
