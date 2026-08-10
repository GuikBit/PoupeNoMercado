/**
 * Confirmação da leitura — a tela onde o ADR-002 vira interface.
 *
 * O ML Kit acerta 91% das leituras que produz, mas não existe faixa de
 * confiança em que ele preencha sozinho e valha a pena (o limiar com zero erro
 * cobre 8,9%). Então TODA leitura passa por aqui: o valor vem pré-preenchido e
 * o usuário confirma com um toque. Poupa digitação em três de cada quatro
 * etiquetas e mantém o erro visível na tela, não escondido num total.
 *
 * O que muda por nível de confiança não é *se* confirma, é o **destaque do que
 * pode estar errado**.
 */
import { Button, Paragraph, Separator, XStack, YStack } from 'tamagui';

import type { AcceptanceDecision } from '../domain/acceptance';
import type { LabelReading } from '../domain/reading';
import { formatCents } from '../ui/money';

interface ReadingConfirmProps {
  reading: LabelReading;
  decision: AcceptanceDecision;
  quantity: number;
  onConfirm: () => void;
  onCorrectPrice: () => void;
  onDiscard: () => void;
}

/** Campos frágeis ganham aviso nominal — genérico não ajuda a conferir. */
const WEAK_LABEL: Record<string, string> = {
  rawName: 'o nome pode estar errado',
  tiers: 'as faixas de quantidade podem estar erradas',
  saleUnit: 'a unidade (kg / unidade) pode estar errada',
  measurePrice: 'o preço por medida pode estar errado',
};

export function ReadingConfirm({
  reading,
  decision,
  quantity,
  onConfirm,
  onCorrectPrice,
  onDiscard,
}: ReadingConfirmProps) {
  const { pricing, product, confidence } = reading;
  const avisos = confidence.weakFields.map((f) => WEAK_LABEL[f]).filter(Boolean);
  const baixa = confidence.level === 'low';

  return (
    <YStack gap="$3" p="$3">
      <YStack gap="$1">
        <Paragraph size="$2" color="$color10">
          Confira na etiqueta
        </Paragraph>
        <Paragraph size="$6" fontWeight="700">
          {product.rawName || 'Produto sem nome legível'}
        </Paragraph>
      </YStack>

      <YStack items="center" gap="$1" p="$3" bg="$color2" rounded="$4">
        <Paragraph size="$2" color="$color10">
          preço de 1 {pricing.saleUnit === 'UN' ? 'unidade' : pricing.saleUnit.toLowerCase()}
        </Paragraph>
        <Paragraph size="$11" fontWeight="900">
          {formatCents(pricing.basePriceCents)}
        </Paragraph>
      </YStack>

      {pricing.tiers.length > 0 ? (
        <YStack gap="$1" p="$3" bg="$color2" rounded="$4">
          <Paragraph size="$2" color="$color10">
            faixas lidas
          </Paragraph>
          {pricing.tiers.map((tier, i) => (
            <XStack key={`${tier.minQty}-${tier.priceCents}-${i}`} justify="space-between">
              <Paragraph size="$3">
                {tier.condition.kind === 'storeCard'
                  ? `no ${tier.condition.cardName}, a partir de ${tier.minQty}`
                  : `a partir de ${tier.minQty}`}
              </Paragraph>
              <Paragraph size="$3" fontWeight="700">
                {formatCents(tier.priceCents)}
              </Paragraph>
            </XStack>
          ))}
        </YStack>
      ) : null}

      {avisos.length > 0 || baixa ? (
        <YStack gap="$1" p="$3" bg="$yellow2" rounded="$4">
          <Paragraph size="$3" color="$yellow11" fontWeight="700">
            {baixa ? 'Leitura pouco confiável — confira com atenção' : 'Confira estes pontos'}
          </Paragraph>
          {avisos.map((aviso) => (
            <Paragraph key={aviso} size="$2" color="$yellow11">
              • {aviso}
            </Paragraph>
          ))}
        </YStack>
      ) : null}

      <Separator />

      {/* Uma string só: filhos mistos com número quebram o wrapper do Tamagui. */}
      <Button size="$6" theme="accent" onPress={onConfirm}>
        {`Confirmar · ${quantity} × ${formatCents(pricing.basePriceCents)}`}
      </Button>

      <XStack gap="$2">
        <Button flex={1} onPress={onCorrectPrice}>
          Corrigir preço
        </Button>
        <Button flex={1} onPress={onDiscard}>
          Descartar
        </Button>
      </XStack>

      <Paragraph size="$1" color="$color10" text="center">
        {decision.reason} · {reading.provenance.engineId} · {reading.provenance.latencyMs} ms
      </Paragraph>
    </YStack>
  );
}
