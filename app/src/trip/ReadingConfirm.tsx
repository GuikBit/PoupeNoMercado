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
 *
 * ⚠️ O preço mostrado aqui é o RESOLVIDO para a quantidade escolhida, nunca o
 * preço base. Uma etiqueta de atacarejo é uma política, não um número: com 3
 * unidades e faixa "a partir de 3", cobrar o base seria mentir na única tela
 * onde a pessoa ainda pode conferir contra a gôndola.
 */
import { Button, Paragraph, XStack, YStack } from 'tamagui';

import type { AcceptanceDecision } from '../domain/acceptance';
import { priceSnapshot,type PriceTier } from '../domain/pricing';
import type { LabelReading } from '../domain/reading';
import { Card, Eyebrow, Money, TierChip } from '../ui/kit';
import { formatCents, formatQuantity } from '../ui/money';

interface ReadingConfirmProps {
  reading: LabelReading;
  decision: AcceptanceDecision;
  quantity: number;
  /** Muda quais faixas valem — as condicionadas ao cartão da loja. */
  useStoreCard: boolean;
  /** Tocar numa faixa pula a quantidade até ela. Ausente para peso. */
  onQuantity?: (quantity: number) => void;
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

/** Texto da faixa na mesma forma impressa na etiqueta. */
function tierLabel(tier: PriceTier): string {
  return tier.condition.kind === 'storeCard'
    ? `no ${tier.condition.cardName}, a partir de ${tier.minQty}`
    : `a partir de ${tier.minQty}`;
}

export function ReadingConfirm({
  reading,
  decision,
  quantity,
  useStoreCard,
  onQuantity,
  onConfirm,
  onCorrectPrice,
  onDiscard,
}: ReadingConfirmProps) {
  const { pricing, product, confidence } = reading;
  const avisos = confidence.weakFields.map((f) => WEAK_LABEL[f]).filter(Boolean);
  const baixa = confidence.level === 'low';
  const porUnidade = pricing.saleUnit === 'UN';

  // A MESMA conta que o repositório grava ao confirmar. O que está na tela é,
  // literalmente, o que vai para o carrinho.
  const { unitPriceCents, totalCents, resolution } = priceSnapshot(
    pricing,
    quantity,
    useStoreCard,
  );
  const aplicada = resolution.appliedTier;
  const unidade = porUnidade ? 'unidade' : pricing.saleUnit.toLowerCase();

  return (
    <YStack gap="$3" p="$3">
      <YStack gap="$1">
        <Eyebrow>Confira na etiqueta</Eyebrow>
        <Paragraph size="$7" fontWeight="800" lineHeight={28}>
          {product.rawName || 'Produto sem nome legível'}
        </Paragraph>
      </YStack>

      <Card items="center" gap="$1">
        <Paragraph size="$2" color="$color10">
          {aplicada ? `preço com a faixa de ${aplicada.minQty}+` : `preço de 1 ${unidade}`}
        </Paragraph>
        <Money cents={unitPriceCents} format={formatCents} size="$11" />
        {aplicada ? (
          <Paragraph size="$2" color="$color10">
            {`de ${formatCents(pricing.basePriceCents)} a ${unidade}`}
          </Paragraph>
        ) : null}
      </Card>

      {/* A escada inteira lida da etiqueta. Preta = valendo agora; amarela =
          convite tocável, que salta a quantidade até a faixa. É a mesma
          gramática da etiqueta física, para conferir de relance. */}
      {pricing.tiers.length > 0 ? (
        <YStack gap="$2">
          <Eyebrow>Faixas lidas</Eyebrow>
          {pricing.tiers.map((tier, i) => {
            // Identidade, não igualdade de valor: `resolvePrice` devolve o
            // próprio objeto de `pricing.tiers`, e duas faixas podem ter os
            // mesmos números sem serem a que está valendo.
            const valendo = tier === aplicada;
            const alcancavel = !valendo && porUnidade && onQuantity !== undefined;
            return (
              <TierChip
                key={`${tier.minQty}-${tier.priceCents}-${i}`}
                tone={valendo ? 'applied' : 'available'}
                label={tierLabel(tier)}
                value={formatCents(tier.priceCents)}
                onPress={alcancavel ? () => onQuantity(tier.minQty) : undefined}
              />
            );
          })}
        </YStack>
      ) : null}

      {avisos.length > 0 || baixa ? (
        <YStack gap="$1" p="$3" bg="$yellow2" rounded="$6">
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

      {/* Uma string só: filhos mistos com número quebram o wrapper do Tamagui.
          O total vai no botão porque é o que entra no carrinho — o usuário
          confirma um valor, não uma intenção. */}
      <Button size="$6" theme="accent" onPress={onConfirm}>
        {`Confirmar · ${formatCents(totalCents)}`}
      </Button>
      <Paragraph size="$2" color="$color10" text="center">
        {`${formatQuantity(quantity, pricing.saleUnit)} × ${formatCents(unitPriceCents)}`}
      </Paragraph>

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
