/**
 * Seletor de quantidade da tela de confirmação. Dois modos, porque as duas
 * coisas são diferentes:
 *
 * - **UN** — passos inteiros, botões grandes o bastante para o polegar de quem
 *   está com a outra mão no carrinho.
 * - **KG/L/M** — peso decimal digitado em gramas. Tratar peso como quantidade
 *   inteira é uma das armadilhas listadas no CLAUDE.md.
 *
 * A dica de faixa NÃO mora aqui. Na confirmação, quem mostra as faixas é o
 * `ReadingConfirm`, que exibe a escada inteira lida da etiqueta; no carrinho,
 * o `TripItemCard` mostra o chip compacto. Duplicar a dica aqui colocaria o
 * mesmo convite duas vezes na mesma tela.
 */
import { Button, Paragraph, XStack } from 'tamagui';

import type { SaleUnit } from '../domain/pricing';
import { Eyebrow, TABULAR } from '../ui/kit';
import { formatQuantity } from '../ui/money';

interface QuantityStepperProps {
  quantity: number;
  saleUnit: SaleUnit;
  onChange: (quantity: number) => void;
  /** Abre o teclado numérico para peso. */
  onEditWeight?: () => void;
}

export function QuantityStepper({
  quantity,
  saleUnit,
  onChange,
  onEditWeight,
}: QuantityStepperProps) {
  if (saleUnit !== 'UN') {
    return (
      <XStack items="center" justify="space-between">
        <Eyebrow>Peso</Eyebrow>
        <Button size="$4" onPress={onEditWeight}>
          {formatQuantity(quantity, saleUnit)}
        </Button>
      </XStack>
    );
  }

  return (
    <XStack items="center" justify="space-between">
      <Eyebrow>Quantidade</Eyebrow>
      <XStack items="center" gap="$3">
        <Button size="$5" circular disabled={quantity <= 1} onPress={() => onChange(quantity - 1)}>
          −
        </Button>
        <Paragraph size="$8" fontWeight="900" width={48} text="center" {...TABULAR}>
          {String(quantity)}
        </Paragraph>
        <Button size="$5" circular onPress={() => onChange(quantity + 1)}>
          +
        </Button>
      </XStack>
    </XStack>
  );
}
