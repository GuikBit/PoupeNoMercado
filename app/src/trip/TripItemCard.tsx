/**
 * Um item já escaneado.
 *
 * Hierarquia: nome e total na primeira linha (é o que se procura ao conferir),
 * a conta em corpo pequeno logo abaixo, controles por último. A faixa de
 * quantidade — o diferencial do produto — aparece como a CAIXA da etiqueta:
 * preta quando já vale, amarela quando é um convite tocável.
 */
import { Button, Paragraph, XStack, YStack } from 'tamagui';

import type { SaleUnit } from '../domain/pricing';
import type { TripLine } from '../state/tripStore';
import { Money, TABULAR, TierChip } from '../ui/kit';
import { formatCents, formatQuantity } from '../ui/money';

interface TripItemCardProps {
  line: TripLine;
  onQty: (qty: number) => void;
  onRemove: () => void;
  onEditWeight: () => void;
}

export function TripItemCard({ line, onQty, onRemove, onEditWeight }: TripItemCardProps) {
  const { row, policy, hint } = line;
  const porUnidade = row.saleUnit === 'UN';
  const faixaAplicada = row.unitPriceCents < policy.basePriceCents;

  return (
    <YStack gap="$3" p="$3" bg="$color2" rounded="$6">
      <XStack justify="space-between" items="flex-start" gap="$3">
        <YStack flex={1} gap="$1">
          <Paragraph size="$5" fontWeight="700" lineHeight={22}>
            {row.rawName}
          </Paragraph>
          <Paragraph size="$2" color="$color10" {...TABULAR}>
            {`${formatQuantity(row.qty, row.saleUnit)} × ${formatCents(row.unitPriceCents)}`}
          </Paragraph>
        </YStack>
        <Money cents={row.totalCents} format={formatCents} size="$7" />
      </XStack>

      {faixaAplicada ? (
        <TierChip
          tone="applied"
          label={`faixa aplicada · de ${formatCents(policy.basePriceCents)}`}
          value={formatCents(row.unitPriceCents)}
        />
      ) : null}

      {hint ? (
        <TierChip
          tone="available"
          label={`leve mais ${hint.qtyNeeded} e cada sai por`}
          value={formatCents(hint.newUnitPriceCents)}
          onPress={() => onQty(row.qty + hint.qtyNeeded)}
        />
      ) : null}

      <XStack items="center" justify="space-between">
        {porUnidade ? (
          <XStack items="center" gap="$3">
            <Button size="$4" circular disabled={row.qty <= 1} onPress={() => onQty(row.qty - 1)}>
              −
            </Button>
            <Paragraph size="$6" fontWeight="900" width={40} text="center" {...TABULAR}>
              {String(row.qty)}
            </Paragraph>
            <Button size="$4" circular onPress={() => onQty(row.qty + 1)}>
              +
            </Button>
          </XStack>
        ) : (
          <Button size="$3" onPress={onEditWeight}>
            {formatQuantity(row.qty, row.saleUnit as SaleUnit)}
          </Button>
        )}

        <Button size="$2" chromeless color="$color10" onPress={onRemove}>
          remover
        </Button>
      </XStack>
    </YStack>
  );
}
