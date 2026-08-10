/**
 * Total da compra com a barra de orçamento — o elemento mais importante do app.
 * É a razão de ser do produto: "nunca seja surpreendido no caixa".
 *
 * O número é enorme e tabular de propósito: precisa ser legível de relance,
 * com o celular na mão, andando no corredor — e não pode tremer a cada item
 * escaneado.
 *
 * A barra satura em 100% e é a COR que comunica o estouro. Barra vazando da
 * caixa confunde: o olho lê "quase lá" quando na verdade já passou.
 */
import { Paragraph, XStack, YStack } from 'tamagui';

import type { BudgetStatus } from '../domain/budget';
import { Eyebrow, TABULAR } from '../ui/kit';
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
  const remaining = budget.remainingCents ?? 0;

  return (
    <YStack gap="$3" p="$4" bg="$color2" rounded="$6">
      <XStack items="center" justify="space-between">
        <Eyebrow>Total parcial</Eyebrow>
        <Paragraph size="$2" color="$color10" {...TABULAR}>
          {`${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`}
        </Paragraph>
      </XStack>

      <Paragraph size="$12" fontWeight="900" color={color} letterSpacing={-1.5} {...TABULAR}>
        {formatCents(budget.spentCents)}
      </Paragraph>

      {budget.limitCents !== null ? (
        <YStack gap="$2">
          <YStack height={8} bg="$color5" rounded="$10" overflow="hidden">
            <YStack height={8} width={`${ratio * 100}%`} bg={color} rounded="$10" />
          </YStack>

          <XStack items="baseline" justify="space-between" gap="$2">
            <Paragraph size="$2" color={color} fontWeight="700">
              {LABEL_BY_STATE[budget.state]}
            </Paragraph>
            <Paragraph size="$2" color="$color10" {...TABULAR}>
              {remaining >= 0
                ? `${formatCents(remaining)} de ${formatCents(budget.limitCents)}`
                : `${formatCents(Math.abs(remaining))} acima do teto`}
            </Paragraph>
          </XStack>
        </YStack>
      ) : (
        <Paragraph size="$2" color="$color10">
          Sem teto — defina um na lista para acompanhar o quanto falta.
        </Paragraph>
      )}
    </YStack>
  );
}
