/** Formulário do gabarito — preenchido no mercado, olhando a etiqueta física. */
import { Button, Input, Paragraph, XStack, YStack } from 'tamagui';

import type { SaleUnit } from '../domain/pricing';
import { Choice } from './Choice';
import type { GroundTruthDraft, TierDraft } from './groundTruthDraft';

const SALE_UNITS: readonly { value: SaleUnit; label: string }[] = [
  { value: 'UN', label: 'UN' },
  { value: 'KG', label: 'KG' },
  { value: 'L', label: 'L' },
  { value: 'M', label: 'M' },
];

interface GroundTruthFormProps {
  draft: GroundTruthDraft;
  onChange: (draft: GroundTruthDraft) => void;
}

export function GroundTruthForm({ draft, onChange }: GroundTruthFormProps) {
  function updateTier(index: number, patch: Partial<TierDraft>) {
    const tiers = draft.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier));
    onChange({ ...draft, tiers });
  }

  return (
    <YStack gap="$2" p="$3" bg="$color2" rounded="$4">
      <Paragraph size="$2" color="$color10">
        GABARITO (confira na etiqueta física)
      </Paragraph>
      <Input
        placeholder="Nome do produto como impresso"
        value={draft.rawName}
        onChangeText={(rawName) => onChange({ ...draft, rawName })}
      />
      <XStack gap="$2">
        <Input
          flex={1}
          placeholder="Preço base (2,99)"
          keyboardType="numeric"
          value={draft.basePrice}
          onChangeText={(basePrice) => onChange({ ...draft, basePrice })}
        />
        <Input
          flex={1}
          placeholder="Código interno"
          keyboardType="numeric"
          value={draft.internalCode}
          onChangeText={(internalCode) => onChange({ ...draft, internalCode })}
        />
      </XStack>
      <Choice
        label="Unidade de venda"
        options={SALE_UNITS}
        value={draft.saleUnit}
        onChange={(saleUnit) => onChange({ ...draft, saleUnit })}
      />

      {draft.tiers.map((tier, index) => (
        <XStack key={index} gap="$2" items="center">
          <Input
            flex={1}
            placeholder="A partir de"
            keyboardType="numeric"
            value={tier.minQty}
            onChangeText={(minQty) => updateTier(index, { minQty })}
          />
          <Input
            flex={1}
            placeholder="Preço (2,79)"
            keyboardType="numeric"
            value={tier.price}
            onChangeText={(price) => updateTier(index, { price })}
          />
          <Button
            size="$2"
            theme={tier.storeCard ? 'accent' : undefined}
            onPress={() => updateTier(index, { storeCard: !tier.storeCard })}
          >
            cartão
          </Button>
          <Button
            size="$2"
            onPress={() =>
              onChange({ ...draft, tiers: draft.tiers.filter((_, i) => i !== index) })
            }
          >
            ×
          </Button>
        </XStack>
      ))}
      <Button
        size="$2"
        onPress={() =>
          onChange({
            ...draft,
            tiers: [...draft.tiers, { minQty: '', price: '', storeCard: false }],
          })
        }
      >
        + faixa de quantidade
      </Button>
    </YStack>
  );
}
