/**
 * Total da compra com a barra de orçamento — o elemento mais importante da
 * tela. É a razão de ser do produto: "nunca seja surpreendido no caixa".
 *
 * O total é enorme de propósito: precisa ser legível de relance, com o celular
 * na mão, andando no corredor, sem parar para focar.
 */
import { Paragraph, XStack, YStack } from 'tamagui';

import type { BudgetStatus } from '../domain/budget';
import { formatCents } from '../ui/money';

const COLOR_BY_STATE = {
  ok: '$green10',
  warning: '$yellow10',
  over: '$red10',
} as const;

const LABEL_BY_STATE = {
  ok: 'dentro do orçamento',
  warning: 'chegando no limite',
  over: 'passou do orçamento',
} as const;

export function TotalBar({ budget, itemCount }: { budget: BudgetStatus; itemCount: number }) {
  const color = COLOR_BY_STATE[budget.state];
  const ratio = budget.ratio === null ? 0 : Math.min(1, budget.ratio);

  return (
    <YStack gap="$2" p="$3" bg="$color2" rounded="$4">
      <XStack items="baseline" justify="space-between">
        <Paragraph size="$10" fontWeight="900" color={color}>
          {formatCents(budget.spentCents)}
        </Paragraph>
        <Paragraph size="$3" color="$color10">
          {itemCount} {itemCount === 1 ? 'item' : 'itens'}
        </Paragraph>
      </XStack>

      {budget.limitCents !== null ? (
        <YStack gap="$1">
          {/* Trilho + preenchimento. A barra satura em 100% e a cor é que
              comunica o estouro — barra passando da caixa confunde. */}
          <YStack height={10} bg="$color4" rounded="$10" overflow="hidden">
            <YStack height={10} width={`${ratio * 100}%`} bg={color} />
          </YStack>
          <XStack justify="space-between">
            <Paragraph size="$2" color={color}>
              {LABEL_BY_STATE[budget.state]}
            </Paragraph>
            <Paragraph size="$2" color="$color10">
              {budget.remainingCents !== null && budget.remainingCents >= 0
                ? `${formatCents(budget.remainingCents)} disponível`
                : `${formatCents(Math.abs(budget.remainingCents ?? 0))} acima`}
              {' · teto '}
              {formatCents(budget.limitCents)}
            </Paragraph>
          </XStack>
        </YStack>
      ) : (
        <Paragraph size="$2" color="$color10">
          Sem teto definido
        </Paragraph>
      )}
    </YStack>
  );
}
