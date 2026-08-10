/**
 * Configurações: cartão da loja, consentimentos e sobre.
 *
 * Os consentimentos começam DESLIGADOS e o texto diz exatamente o que sai do
 * aparelho. O padrão do produto é não mandar nada para fora — ligar é escolha
 * consciente, não pegadinha de caixa marcada (docs/05, LGPD).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Button, Paragraph, ScrollView, Separator, XStack, YStack } from 'tamagui';

import { appRepoContext } from '../db/client';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  setSetting,
  type Settings,
} from '../db/repositories/settingsRepo';

interface LinhaProps {
  titulo: string;
  descricao: string;
  ligado: boolean;
  onToggle: () => void;
  alerta?: boolean;
}

function Linha({ titulo, descricao, ligado, onToggle, alerta }: LinhaProps) {
  return (
    <YStack gap="$1" p="$3" bg={alerta && ligado ? '$yellow2' : '$color2'} rounded="$4">
      <XStack items="center" justify="space-between" gap="$2">
        <Paragraph flex={1} size="$4" fontWeight="700">
          {titulo}
        </Paragraph>
        <Button size="$3" theme={ligado ? 'accent' : undefined} onPress={onToggle}>
          {ligado ? 'ligado' : 'desligado'}
        </Button>
      </XStack>
      <Paragraph size="$2" color="$color10">
        {descricao}
      </Paragraph>
    </YStack>
  );
}

export default function SettingsScreen() {
  const ctx = useMemo(() => appRepoContext(), []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useFocusEffect(
    useCallback(() => {
      setSettings(loadSettings(ctx.db));
    }, [ctx]),
  );

  function alternar(chave: keyof Settings) {
    setSettings(setSetting(ctx, chave, !settings[chave]));
  }

  return (
    <ScrollView flex={1} contentContainerStyle={{ p: '$3', gap: '$3' }}>
      <Linha
        titulo="Cartão da loja"
        descricao="Começar toda compra nova já usando o cartão da loja. Muda o preço aplicado nas faixas condicionadas."
        ligado={settings.defaultUseStoreCard}
        onToggle={() => alternar('defaultUseStoreCard')}
      />

      <Separator />
      <Paragraph size="$2" color="$color10">
        O app funciona inteiro sem internet. As opções abaixo mandam dados para fora do aparelho e
        começam desligadas.
      </Paragraph>

      <Linha
        alerta
        titulo="Usar leitura na nuvem quando falhar"
        descricao="Quando o motor do próprio celular não conseguir ler a etiqueta, tenta na nuvem. Isso ENVIA A FOTO da etiqueta para o Google Cloud Vision, e só funciona com internet."
        ligado={settings.consentCloudOcr}
        onToggle={() => alternar('consentCloudOcr')}
      />

      <Linha
        alerta
        titulo="Ajudar a melhorar a leitura"
        descricao="Envia o texto lido e as correções que você faz, para o app errar menos. Não envia suas compras nem seus totais."
        ligado={settings.consentShareReadings}
        onToggle={() => alternar('consentShareReadings')}
      />

      <Separator />
      <YStack gap="$1" p="$3" bg="$color2" rounded="$4">
        <Paragraph size="$4" fontWeight="700">
          Sobre
        </Paragraph>
        <Paragraph size="$2" color="$color10">
          Poupe no Mercado — nunca seja surpreendido no caixa.
        </Paragraph>
        <Paragraph size="$2" color="$color10">
          A leitura das etiquetas roda no próprio aparelho. Seus dados ficam no celular; nada é
          enviado sem você ligar acima.
        </Paragraph>
        <Paragraph size="$1" color="$color10">
          Versão 0.1.0
        </Paragraph>
      </YStack>
    </ScrollView>
  );
}
