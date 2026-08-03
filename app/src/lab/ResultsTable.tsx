/** Colunas comparativas por motor: nome/preço parseados, confiança e latência. */
import { Paragraph, XStack, YStack } from 'tamagui';

import { formatCents } from '../lib/money';
import type { EngineRun } from './types';

interface ResultsTableProps {
  engines: Record<string, EngineRun>;
  detectMethod: 'quad' | 'fallback';
}

function runSummary(run: EngineRun): { price: string; detail: string; ok: boolean } {
  if (run.error) {
    return { price: '—', detail: run.error, ok: false };
  }
  if (!run.parsed) {
    // Mostra o texto bruto para separar "OCR não leu" de "parser rejeitou".
    const rawText = run.ocrRaw
      .map((block) => block.text)
      .join(' · ')
      .trim();
    const excerpt = rawText.length > 180 ? `${rawText.slice(0, 180)}…` : rawText;
    return {
      price: '—',
      detail: excerpt.length > 0 ? `parser rejeitou. OCR leu: "${excerpt}"` : 'OCR não devolveu texto',
      ok: false,
    };
  }
  const { pricing } = run.parsed;
  const tiers = pricing.tiers
    .map((t) => `${t.minQty}+ ${formatCents(t.priceCents)}`)
    .join(' · ');
  return {
    price: `${formatCents(pricing.basePriceCents)}${pricing.saleUnit === 'UN' ? '' : `/${pricing.saleUnit}`}`,
    detail: [run.parsed.product.rawName, tiers].filter(Boolean).join('\n'),
    ok: true,
  };
}

export function ResultsTable({ engines, detectMethod }: ResultsTableProps) {
  const entries = Object.entries(engines);
  return (
    <YStack gap="$2" p="$3" bg="$color2" rounded="$4">
      <XStack justify="space-between">
        <Paragraph size="$2" color="$color10">
          RESULTADO
        </Paragraph>
        <Paragraph size="$2" color="$color10">
          detector: {detectMethod === 'quad' ? 'retificado' : 'guia (fallback)'}
        </Paragraph>
      </XStack>
      {entries.length === 0 ? (
        <Paragraph color="$color10">Nenhum motor executado.</Paragraph>
      ) : (
        entries.map(([engineId, run]) => {
          const summary = runSummary(run);
          const level = run.parsed?.confidence.level;
          return (
            <YStack key={engineId} gap="$1" borderBottomWidth={1} borderColor="$color4" pb="$2">
              <XStack justify="space-between" items="center">
                <Paragraph fontWeight="700">{engineId}</Paragraph>
                <Paragraph fontWeight="700" color={summary.ok ? undefined : '$red10'}>
                  {summary.price}
                </Paragraph>
              </XStack>
              <XStack justify="space-between">
                <Paragraph size="$2" color="$color10">
                  {run.confidence !== null
                    ? `conf ${run.confidence.toFixed(2)} (${level})`
                    : 'sem leitura'}
                </Paragraph>
                <Paragraph size="$2" color="$color10">
                  {run.latencyMs >= 0 ? `${run.latencyMs} ms` : '—'}
                </Paragraph>
              </XStack>
              {summary.detail ? (
                <Paragraph size="$2" color={summary.ok ? '$color11' : '$red10'}>
                  {summary.detail}
                </Paragraph>
              ) : null}
            </YStack>
          );
        })
      )}
    </YStack>
  );
}
