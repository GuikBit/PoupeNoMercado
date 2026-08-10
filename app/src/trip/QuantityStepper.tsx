/**
 * Seletor de quantidade. Dois modos, porque as duas coisas são diferentes:
 *
 * - **UN** — passos inteiros. Mostra a dica de faixa ("leve mais 2 e economize
 *   R$ 0,20 cada"), que é o diferencial do produto.
 * - **KG/L/M** — peso decimal digitado em gramas. Tratar peso como quantidade
 *   inteira é uma das armadilhas listadas no CLAUDE.md.
 */
import { Button, Paragraph, XStack, YStack } from 'tamagui';

import type { SaleUnit } from '../domain/pricing';
import { formatCents, formatQuantity } from '../ui/money';

export interface QuantityHint {
  qtyNeeded: number;
  savingsPerUnitCents: number;
  newUnitPriceCents: number;
}

interface QuantityStepperProps {
  quantity: number;
  saleUnit: SaleUnit;
  onChange: (quantity: number) => void;
  hint?: QuantityHint | null;
  /** Abre o teclado numérico para peso. */
  onEditWeight?: () => void;
}

export function QuantityStepper({
  quantity,
  saleUnit,
  onChange,
  hint,
  onEditWeight,
}: QuantityStepperProps) {
  if (saleUnit !== 'UN') {
    return (
      <YStack gap="$2">
        <XStack items="center" justify="space-between">
          <Paragraph size="$3" color="$color10">
            Peso
          </Paragraph>
          <Button size="$4" onPress={onEditWeight}>
            {formatQuantity(quantity, saleUnit)}
          </Button>
        </XStack>
      </YStack>
    );
  }

  return (
    <YStack gap="$2">
      <XStack items="center" justify="space-between">
        <Paragraph size="$3" color="$color10">
          Quantidade
        </Paragraph>
        <XStack items="center" gap="$3">
          <Button
            size="$5"
            circular
            disabled={quantity <= 1}
            onPress={() => onChange(quantity - 1)}
          >
            −
          </Button>
          <Paragraph size="$8" fontWeight="900" width={48} text="center">
            {String(quantity)}
          </Paragraph>
          <Button size="$5" circular onPress={() => onChange(quantity + 1)}>
            +
          </Button>
        </XStack>
      </XStack>

      {hint ? (
        <XStack
          items="center"
          justify="space-between"
          p="$2"
          bg="$green2"
          rounded="$4"
          onPress={() => onChange(quantity + hint.qtyNeeded)}
          pressStyle={{ opacity: 0.7 }}
        >
          <Paragraph size="$2" color="$green11" flex={1}>
            Leve mais {hint.qtyNeeded} e economize {formatCents(hint.savingsPerUnitCents)} em cada
            {' — '}
            sai a {formatCents(hint.newUnitPriceCents)}
          </Paragraph>
          <Paragraph size="$2" color="$green11" fontWeight="700">
            aplicar
          </Paragraph>
        </XStack>
      ) : null}
    </YStack>
  );
}
