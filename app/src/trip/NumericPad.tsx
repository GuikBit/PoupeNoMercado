/**
 * Teclado numérico grande — a entrada manual, que nunca bloqueia
 * (princípio nº 4). Os dígitos entram pela DIREITA, como numa calculadora de
 * caixa: digitar 1·2·3·4 vira 12,34. Sem vírgula, sem cursor, sem ambiguidade.
 *
 * As teclas são grandes de propósito: a mão está segurando o celular e o
 * carrinho ao mesmo tempo.
 */
import { Button, Paragraph, XStack, YStack } from 'tamagui';

import { formatCents, popDigit, pushDigit } from '../ui/money';

const ROWS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
] as const;

interface NumericPadProps {
  valueCents: number;
  onChange: (cents: number) => void;
  /** Rótulo acima do valor: "Preço", "Peso em gramas"… */
  label: string;
  /** Como mostrar o valor — dinheiro por padrão. */
  format?: (value: number) => string;
}

export function NumericPad({ valueCents, onChange, label, format }: NumericPadProps) {
  const show = format ?? formatCents;

  return (
    <YStack gap="$3">
      <YStack items="center" gap="$1" p="$3" bg="$color2" rounded="$4">
        <Paragraph size="$2" color="$color10">
          {label}
        </Paragraph>
        <Paragraph size="$10" fontWeight="900">
          {show(valueCents)}
        </Paragraph>
      </YStack>

      <YStack gap="$2">
        {ROWS.map((row) => (
          <XStack key={row.join()} gap="$2">
            {row.map((digit) => (
              <Button
                key={digit}
                flex={1}
                height={64}
                size="$6"
                onPress={() => onChange(pushDigit(valueCents, digit))}
              >
                {/* String explícita: o Tamagui embrulha filho `string` em Text,
                    mas número cru estoura "Text strings must be rendered
                    within a <Text> component". */}
                {String(digit)}
              </Button>
            ))}
          </XStack>
        ))}
        <XStack gap="$2">
          <Button flex={1} height={64} size="$6" onPress={() => onChange(0)}>
            C
          </Button>
          <Button
            flex={1}
            height={64}
            size="$6"
            onPress={() => onChange(pushDigit(valueCents, 0))}
          >
            0
          </Button>
          <Button flex={1} height={64} size="$6" onPress={() => onChange(popDigit(valueCents))}>
            ⌫
          </Button>
        </XStack>
      </YStack>
    </YStack>
  );
}
