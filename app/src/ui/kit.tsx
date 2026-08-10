/**
 * Vocabulário visual do app.
 *
 * A direção vem do material do próprio produto: a **etiqueta amarela de
 * gôndola** que o app existe para ler. Ela tem uma gramática — sobrancelha
 * pequena em caixa alta ("A PARTIR DE 3"), numeral pesadíssimo, e a faixa
 * promocional dentro de uma CAIXA PRETA. Falar a mesma língua faz o usuário
 * casar tela↔prateleira de relance, que é a tarefa dele no corredor.
 *
 * Restrição deliberada: o amarelo/preto da etiqueta é usado SÓ na faixa de
 * quantidade. É o diferencial do produto e merece ser a única coisa gritante;
 * o resto fica quieto. Verde/âmbar/vermelho ficam restritos ao orçamento,
 * onde a cor é semântica e não decorativa.
 */
import type { ReactNode } from 'react';
import type { ColorTokens, FontSizeTokens } from 'tamagui';
import { Paragraph, XStack, YStack } from 'tamagui';

/** Amarelo e preto da etiqueta física do Bahamas Mix. */
export const TAG_YELLOW = '#F2C200';
export const TAG_INK = '#111111';

/**
 * Numerais tabulares. O total muda a cada item escaneado, e com dígito
 * proporcional o número treme lateralmente a cada atualização — desconfortável
 * justamente no elemento que a pessoa fica olhando.
 */
export const TABULAR = { fontVariant: ['tabular-nums' as const] };

interface EyebrowProps {
  children: ReactNode;
  /** Contagem à direita do rótulo: "NA SACOLA · 7". */
  count?: number;
  color?: ColorTokens;
}

/** Rótulo de seção, na mesma chave da sobrancelha impressa na etiqueta. */
export function Eyebrow({ children, count, color = '$color10' }: EyebrowProps) {
  return (
    <Paragraph size="$1" color={color} letterSpacing={1.2} fontWeight="700" textTransform="uppercase">
      {count === undefined ? children : `${String(children)} · ${count}`}
    </Paragraph>
  );
}

/** Superfície padrão de conteúdo. Cantos suaves, sem sombra — sombra em lista
    longa vira ruído e custa render no Android. */
export function Card({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) {
  return (
    <YStack gap="$2" p="$3" bg="$color2" rounded="$6" {...rest}>
      {children}
    </YStack>
  );
}

/**
 * A assinatura da interface: a caixa da faixa de quantidade, igual à impressa
 * na etiqueta.
 *
 * `applied` = preta, como o box da etiqueta quando o preço vale.
 * `available` = amarela, um convite — "leve mais 2 e cada sai por…".
 */
export function TierChip({
  tone,
  label,
  value,
  onPress,
}: {
  tone: 'applied' | 'available';
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const aplicada = tone === 'applied';
  return (
    <XStack
      items="center"
      justify="space-between"
      gap="$2"
      px="$3"
      py="$2"
      rounded="$4"
      bg={aplicada ? TAG_INK : TAG_YELLOW}
      onPress={onPress}
      pressStyle={onPress ? { opacity: 0.75 } : undefined}
    >
      <Paragraph
        flex={1}
        size="$2"
        fontWeight="700"
        color={aplicada ? 'white' : TAG_INK}
        letterSpacing={0.3}
      >
        {label}
      </Paragraph>
      <Paragraph size="$4" fontWeight="900" color={aplicada ? 'white' : TAG_INK} {...TABULAR}>
        {value}
      </Paragraph>
    </XStack>
  );
}

/** Dinheiro. `size` controla a escala; o peso e os tabulares vêm de graça. */
export function Money({
  cents,
  format,
  size = '$8',
  color,
}: {
  cents: number;
  format: (c: number) => string;
  size?: FontSizeTokens;
  color?: ColorTokens;
}) {
  return (
    <Paragraph size={size} fontWeight="900" color={color} letterSpacing={-0.5} {...TABULAR}>
      {format(cents)}
    </Paragraph>
  );
}
