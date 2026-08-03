/**
 * Tela única do Laboratório de Etiquetas (docs/06 §3): captura ou importa,
 * roda todos os motores sobre o MESMO bitmap, compara lado a lado, colhe
 * gabarito + veredito humano e persiste o caso completo no SQLite.
 */
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Button, Input, Paragraph, ScrollView, Spinner, XStack, YStack } from 'tamagui';

import { registerDefaultEngines } from '../ocr/engines/bootstrap';
import type { ImageRef } from '../ocr/types';
import { CaptureView } from './CaptureView';
import { Choice } from './Choice';
import { openLabDb } from './db';
import { exportCases } from './export';
import {
  draftToGroundTruth,
  EMPTY_DRAFT,
  type GroundTruthDraft,
  readingToDraft,
} from './groundTruthDraft';
import { GroundTruthForm } from './GroundTruthForm';
import { type LabRun, runLabPipeline } from './pipeline';
import { createLabCaseRepository } from './repository';
import { ResultsTable } from './ResultsTable';
import { saveCase } from './saveCase';
import type { CaptureConditions, LabLabelType, VerdictEngine } from './types';

const LABEL_TYPES: readonly { value: LabLabelType; label: string }[] = [
  { value: 'bahamas_oferta', label: 'A · Oferta' },
  { value: 'bahamas_gondola', label: 'B · Gôndola' },
  { value: 'bahamas_perecivel', label: 'C · Perecível' },
  { value: 'bahamas_cartaz', label: 'D · Cartaz' },
  { value: 'adversarial', label: 'Adversarial' },
];

const LIGHTING = [
  { value: 'normal', label: 'normal' },
  { value: 'dim', label: 'pouca luz' },
  { value: 'glare', label: 'reflexo' },
] as const;

const ANGLE = [
  { value: 'frontal', label: 'frontal' },
  { value: 'oblique', label: 'oblíquo' },
  { value: 'steep', label: 'acentuado' },
] as const;

const CONDITION = [
  { value: 'flat', label: 'plana' },
  { value: 'curved', label: 'curvada' },
  { value: 'creased', label: 'amassada' },
  { value: 'behind_glass', label: 'atrás de vidro' },
] as const;

const VERDICT = [
  { value: 'mlkit', label: 'ML Kit' },
  { value: 'cloudvision', label: 'Cloud' },
  { value: 'none', label: 'nenhum' },
] as const;

export function LabScreen() {
  // Registro idempotente dos motores + abertura do banco, uma vez por mount.
  const repo = useMemo(() => {
    registerDefaultEngines();
    return createLabCaseRepository(openLabDb());
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<LabRun | null>(null);
  const [savedCount, setSavedCount] = useState(() => repo.count());
  const [labelType, setLabelType] = useState<LabLabelType>('bahamas_gondola');
  const [conditions, setConditions] = useState<CaptureConditions>({
    lighting: 'normal',
    angle: 'frontal',
    condition: 'flat',
  });
  const [draft, setDraft] = useState<GroundTruthDraft>(EMPTY_DRAFT);
  const [bestEngine, setBestEngine] = useState<VerdictEngine>('none');
  const [note, setNote] = useState('');

  async function process(photo: ImageRef) {
    setBusy(true);
    setError(null);
    try {
      const result = await runLabPipeline(photo);
      // Pré-preenche o gabarito com a primeira leitura válida — CONFIRA na etiqueta.
      const firstParsed = Object.values(result.engines).find((r) => r.parsed)?.parsed ?? null;
      setDraft(firstParsed ? readingToDraft(firstParsed) : EMPTY_DRAFT);
      setBestEngine('none');
      setNote('');
      setRun(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importFromGallery() {
    try {
      const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      await process({ uri: asset.uri, width: asset.width, height: asset.height });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const uri = await exportCases(repo.list(), new Date().toISOString());
      setError(`Export gravado em ${uri.replace(/^file:\/\//, '')}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleSave() {
    if (!run) return;
    try {
      saveCase(repo, {
        run,
        labelType,
        conditions,
        groundTruth: draftToGroundTruth(draft),
        verdict: { bestEngine, note: note.trim() },
      });
      setSavedCount((count) => count + 1);
      setRun(null);
      setDraft(EMPTY_DRAFT);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!run) {
    return (
      <YStack flex={1}>
        <XStack p="$2" gap="$2" items="center" justify="space-between">
          <Button size="$3" onPress={importFromGallery} disabled={busy}>
            Importar da galeria
          </Button>
          <Button size="$3" onPress={handleExport} disabled={busy || savedCount === 0}>
            Exportar
          </Button>
          <Paragraph size="$2" color="$color10">
            {savedCount} casos
          </Paragraph>
        </XStack>
        <YStack flex={1}>
          <CaptureView onPhoto={process} onError={setError} disabled={busy} />
          {busy ? (
            <YStack
              position="absolute"
              t={0}
              b={0}
              l={0}
              r={0}
              items="center"
              justify="center"
              bg="rgba(0,0,0,0.5)"
            >
              <Spinner size="large" color="$color1" />
              <Paragraph color="white">Rodando motores…</Paragraph>
            </YStack>
          ) : null}
        </YStack>
        {error ? (
          <Paragraph p="$2" size="$2" color="$red10">
            {error}
          </Paragraph>
        ) : null}
      </YStack>
    );
  }

  const groundTruthValid = draftToGroundTruth(draft) !== null;

  return (
    <ScrollView flex={1} contentContainerStyle={{ p: '$3', gap: '$3' }}>
      <ResultsTable engines={run.engines} detectMethod={run.detect.method} />

      <GroundTruthForm draft={draft} onChange={setDraft} />
      {!groundTruthValid ? (
        <Paragraph size="$2" color="$red10">
          Gabarito incompleto — o caso será salvo sem gabarito (dá para completar depois
          reprocessando da galeria).
        </Paragraph>
      ) : null}

      <YStack gap="$2" p="$3" bg="$color2" rounded="$4">
        <Choice
          label="Tipo de etiqueta"
          options={LABEL_TYPES}
          value={labelType}
          onChange={setLabelType}
        />
        <Choice
          label="Iluminação"
          options={LIGHTING}
          value={conditions.lighting}
          onChange={(lighting) => setConditions({ ...conditions, lighting })}
        />
        <Choice
          label="Ângulo"
          options={ANGLE}
          value={conditions.angle}
          onChange={(angle) => setConditions({ ...conditions, angle })}
        />
        <Choice
          label="Etiqueta"
          options={CONDITION}
          value={conditions.condition}
          onChange={(condition) => setConditions({ ...conditions, condition })}
        />
      </YStack>

      <YStack gap="$2" p="$3" bg="$color2" rounded="$4">
        <Choice label="Melhor motor" options={VERDICT} value={bestEngine} onChange={setBestEngine} />
        <Input placeholder="Observação" value={note} onChangeText={setNote} />
      </YStack>

      {error ? (
        <Paragraph size="$2" color="$red10">
          {error}
        </Paragraph>
      ) : null}

      <XStack gap="$2">
        <Button flex={1} onPress={() => setRun(null)}>
          Descartar
        </Button>
        <Button flex={2} theme="accent" onPress={handleSave}>
          SALVAR CASO
        </Button>
      </XStack>
    </ScrollView>
  );
}
