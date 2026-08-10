/**
 * Escaneamento: câmera → leitura → confirmação → carrinho.
 *
 * O fluxo volta para a câmera depois de cada item confirmado (escaneamento
 * contínuo, 5.3): sair da câmera a cada produto tornaria a compra insuportável.
 *
 * A entrada manual está sempre a um toque, em qualquer estado — princípio nº 4,
 * o usuário jamais fica travado no corredor.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Paragraph, ScrollView, Spinner, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import { itemsOfList, setListItemChecked } from '../db/repositories/listRepo';
import { saveReading } from '../db/repositories/readingRepo';
import { loadSettings } from '../db/repositories/settingsRepo';
import type { PricingPolicy, SaleUnit } from '../domain/pricing';
import { CaptureView } from '../lab/CaptureView';
import { registerDefaultEngines } from '../ocr/engines/bootstrap';
import { getEngine } from '../ocr/engines/registry';
import type { ImageRef, OcrResult } from '../ocr/types';
import { FALLBACK_ENGINE, scanLabel,type ScanOutcome } from '../scan/scanPipeline';
import { useTripStore } from '../state/tripStore';
import { type ListMatch, matchScanToList, suggestionLabel } from '../trip/listMatching';
import { NumericPad } from '../trip/NumericPad';
import { QuantityStepper } from '../trip/QuantityStepper';
import { ReadingConfirm } from '../trip/ReadingConfirm';
import { vibrar } from '../ui/feedback';
import { formatCents, formatQuantity, gramsToQuantity } from '../ui/money';
import { useKeepAwakeDuringTrip } from '../ui/useKeepAwake';

type Etapa =
  | { nome: 'camera' }
  | { nome: 'lendo' }
  | { nome: 'confirmar'; resultado: ScanOutcome }
  | { nome: 'manual'; precoCents: number; nome_produto: string };

export default function ScanScreen() {
  const router = useRouter();
  const ctx = useMemo(() => appRepoContext(), []);
  const { trip, attach, addItem } = useTripStore();
  // Esta rota roda sem cabeçalho (a câmera ocupa a tela toda), então os passos
  // internos precisam respeitar a barra de status na mão — senão o texto sai
  // por baixo do relógio e da bateria.
  const insets = useSafeAreaInsets();

  const [etapa, setEtapa] = useState<Etapa>({ nome: 'camera' });
  const [quantidade, setQuantidade] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  /** Casamento pendente de resposta do usuário (score entre 0,45 e 0,75). */
  const [sugestao, setSugestao] = useState<ListMatch | null>(null);
  /** Pesagem do item em confirmação — só existe para KG/L/M. */
  const [pesando, setPesando] = useState<{ gramas: number; saleUnit: SaleUnit } | null>(null);

  // A tela fica ligada durante o escaneamento: apagar entre um item e outro
  // obrigaria a desbloquear dezenas de vezes por compra.
  useKeepAwakeDuringTrip();

  useEffect(() => {
    registerDefaultEngines();
    attach(ctx);
  }, [attach, ctx]);

  const voltarParaCamera = useCallback(() => {
    setEtapa({ nome: 'camera' });
    setQuantidade(1);
    setPesando(null);
    setErro(null);
  }, []);

  /**
   * Casa o produto com a lista. `auto` marca sozinho; `suggest` pergunta —
   * marcar o item errado faz a pessoa sair do mercado sem o produto (§8).
   */
  function casarComLista(nomeProduto: string) {
    if (!trip?.listId) return;
    const match = matchScanToList(nomeProduto, itemsOfList(ctx.db, trip.listId));
    if (match.action === 'auto' && match.item) {
      setListItemChecked(ctx, match.item.id, true);
      return;
    }
    if (match.action === 'suggest') setSugestao(match);
  }

  /**
   * Escalonamento para a nuvem — só com consentimento explícito, porque manda
   * a IMAGEM da etiqueta para fora do aparelho. Devolver null significa "não
   * dá para escalar agora", e o fluxo segue para a entrada manual.
   */
  function escalonamento(): ((image: ImageRef) => Promise<OcrResult | null>) | undefined {
    if (!loadSettings(ctx.db).consentCloudOcr) return undefined;
    return async (image) => {
      try {
        return await getEngine(FALLBACK_ENGINE).recognize(image);
      } catch {
        // Sem rede, sem chave, timeout: cai no manual, que nunca bloqueia.
        return null;
      }
    };
  }

  async function processar(photo: ImageRef) {
    setEtapa({ nome: 'lendo' });
    setErro(null);
    try {
      const resultado = await scanLabel(photo, {
        capturedAt: new Date().toISOString(),
        escalateFn: escalonamento(),
      });

      if (resultado.reading) {
        // Auditoria: guarda OCR bruto e parse — é o que permite melhorar o
        // parser depois sem voltar ao mercado.
        saveReading(ctx, {
          tripId: trip?.id ?? null,
          reading: resultado.reading,
          ocrRaw: resultado.ocrRaw,
          imagePath: resultado.imageUri,
        });
      }

      if (resultado.decision.action === 'manual' || !resultado.reading) {
        void vibrar('falhou');
        setEtapa({ nome: 'manual', precoCents: 0, nome_produto: '' });
        return;
      }
      void vibrar('lido');
      setEtapa({ nome: 'confirmar', resultado });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setEtapa({ nome: 'camera' });
    }
  }

  function confirmarLeitura(resultado: ScanOutcome) {
    const reading = resultado.reading;
    if (!reading) return;
    addItem({
      rawName: reading.product.rawName,
      policy: reading.pricing,
      qty: quantidade,
      entryMode: 'scan',
      internalCode: reading.product.internalCode ?? null,
      ean: reading.product.ean ?? null,
      confidence: reading.confidence.score,
    });
    void vibrar('confirmado');
    casarComLista(reading.product.rawName);
    voltarParaCamera();
  }

  function salvarManual(precoCents: number, nomeProduto: string) {
    const policy: PricingPolicy = {
      basePriceCents: precoCents,
      saleUnit: 'UN',
      tiers: [],
    };
    addItem({
      rawName: nomeProduto || 'Item sem nome',
      policy,
      qty: quantidade,
      entryMode: 'manual',
    });
    void vibrar('confirmado');
    if (nomeProduto) casarComLista(nomeProduto);
    voltarParaCamera();
  }

  if (!trip) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$3" p="$4" pt={insets.top + 12}>
        <Paragraph text="center" color="$color10">
          Nenhuma compra em andamento.
        </Paragraph>
        <Button theme="accent" onPress={() => router.replace('/')}>
          Voltar
        </Button>
      </YStack>
    );
  }

  // Peso do item sendo confirmado. Sem isto, um produto por quilo entrava
  // sempre como 1 kg: o botão de peso na confirmação não abria nada e só dava
  // para corrigir depois, no carrinho.
  if (pesando !== null) {
    return (
      <YStack flex={1} gap="$3" p="$4" pt={insets.top + 12}>
        <NumericPad
          label="Peso em gramas"
          valueCents={pesando.gramas}
          format={(g) => formatQuantity(gramsToQuantity(g), pesando.saleUnit)}
          onChange={(gramas) => setPesando({ ...pesando, gramas })}
        />
        <XStack gap="$2">
          <Button flex={1} onPress={() => setPesando(null)}>
            Cancelar
          </Button>
          <Button
            flex={2}
            theme="accent"
            disabled={pesando.gramas <= 0}
            onPress={() => {
              setQuantidade(gramsToQuantity(pesando.gramas));
              setPesando(null);
            }}
          >
            Usar este peso
          </Button>
        </XStack>
      </YStack>
    );
  }

  if (etapa.nome === 'confirmar') {
    const reading = etapa.resultado.reading;
    if (!reading) return null;
    const porUnidade = reading.pricing.saleUnit === 'UN';
    return (
      <ScrollView
        flex={1}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ pt: insets.top + 12, pb: 40 }}
      >
        <YStack px="$3" pt="$2">
          <QuantityStepper
            quantity={quantidade}
            saleUnit={reading.pricing.saleUnit}
            onChange={setQuantidade}
            onEditWeight={() =>
              setPesando({
                gramas: Math.round(quantidade * 1000),
                saleUnit: reading.pricing.saleUnit,
              })
            }
          />
        </YStack>
        <ReadingConfirm
          reading={reading}
          decision={etapa.resultado.decision}
          quantity={quantidade}
          useStoreCard={trip.useStoreCard === 1}
          onQuantity={porUnidade ? setQuantidade : undefined}
          onConfirm={() => confirmarLeitura(etapa.resultado)}
          onCorrectPrice={() =>
            setEtapa({
              nome: 'manual',
              precoCents: reading.pricing.basePriceCents,
              nome_produto: reading.product.rawName,
            })
          }
          onDiscard={voltarParaCamera}
        />
      </ScrollView>
    );
  }

  if (etapa.nome === 'manual') {
    return (
      <YStack flex={1} gap="$3" p="$3" pt={insets.top + 12}>
        <Paragraph size="$2" color="$color10">
          {etapa.nome_produto
            ? `Corrigindo: ${etapa.nome_produto}`
            : 'Não deu para ler a etiqueta — digite o preço'}
        </Paragraph>
        <NumericPad
          label="Preço de 1 unidade"
          valueCents={etapa.precoCents}
          onChange={(precoCents) => setEtapa({ ...etapa, precoCents })}
        />
        <QuantityStepper quantity={quantidade} saleUnit="UN" onChange={setQuantidade} />
        <XStack gap="$2">
          <Button flex={1} onPress={voltarParaCamera}>
            Cancelar
          </Button>
          <Button
            flex={2}
            theme="accent"
            disabled={etapa.precoCents <= 0}
            onPress={() => salvarManual(etapa.precoCents, etapa.nome_produto)}
          >
            {`Adicionar ${formatCents(etapa.precoCents * quantidade)}`}
          </Button>
        </XStack>
      </YStack>
    );
  }

  return (
    <YStack flex={1}>
      <CaptureView onPhoto={processar} onError={setErro} disabled={etapa.nome === 'lendo'} />

      {/* A câmera fica em tela cheia de propósito e a barra flutua por cima.
          Aqui NÃO se aplica inset: o overlay sobre imagem é legível encostado
          no topo, e empurrar os botões para baixo comeria área de enquadramento.
          Os passos pós-captura (confirmação e manual) é que respeitam o inset. */}
      <XStack
        position="absolute"
        t={0}
        l={0}
        r={0}
        pt="$3"
        px="$2"
        pb="$2"
        gap="$2"
        justify="space-between"
      >
        <Button size="$3" onPress={() => router.back()}>
          Voltar
        </Button>
        {/* Princípio nº 4: o manual nunca está a mais de um toque. */}
        <Button
          size="$3"
          onPress={() => setEtapa({ nome: 'manual', precoCents: 0, nome_produto: '' })}
        >
          Digitar preço
        </Button>
      </XStack>

      {etapa.nome === 'lendo' ? (
        <YStack
          position="absolute"
          t={0}
          b={0}
          l={0}
          r={0}
          items="center"
          justify="center"
          gap="$2"
          bg="rgba(0,0,0,0.5)"
        >
          <Spinner size="large" color="$color1" />
          <Paragraph color="white">Lendo a etiqueta…</Paragraph>
        </YStack>
      ) : null}

      {/* Casamento incerto: pergunta. Marcar errado tira a pessoa do mercado
          sem o produto — falso positivo custa mais que falso negativo (§8). */}
      {sugestao?.item ? (
        <YStack position="absolute" b="$10" l="$3" r="$3" gap="$2" p="$3" bg="$background" rounded="$4">
          <Paragraph size="$3">{suggestionLabel(sugestao)}</Paragraph>
          <XStack gap="$2">
            <Button flex={1} size="$3" onPress={() => setSugestao(null)}>
              Não
            </Button>
            <Button
              flex={1}
              size="$3"
              theme="accent"
              onPress={() => {
                if (sugestao.item) setListItemChecked(ctx, sugestao.item.id, true);
                setSugestao(null);
              }}
            >
              Marcar
            </Button>
          </XStack>
        </YStack>
      ) : null}

      {erro ? (
        <Paragraph
          position="absolute"
          b={0}
          l={0}
          r={0}
          p="$2"
          size="$2"
          color="$red10"
          bg="rgba(255,255,255,0.92)"
        >
          {erro}
        </Paragraph>
      ) : null}
    </YStack>
  );
}
