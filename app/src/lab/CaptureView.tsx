/**
 * Câmera do Laboratório com o guia visual (retículo) — evolução da tela
 * scan da Etapa 0. A proporção do retículo é a MESMA do fallback do detector.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Button, Paragraph, YStack } from 'tamagui';

import { GUIDE_RATIO } from '../ocr/detector/geometry';
import type { ImageRef } from '../ocr/types';

interface CaptureViewProps {
  onPhoto: (photo: ImageRef) => void;
  onError: (message: string) => void;
  disabled: boolean;
}

/**
 * A câmera só pode ficar ativa com o app em primeiro plano E a tela focada.
 * Com isActive fixo, o Android toma a câmera ao minimizar e a sessão nunca
 * é reaberta — tela preta ao voltar para o app.
 */
function useCameraActive(): boolean {
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return appActive && focused;
}

export function CaptureView({ onPhoto, onError, disabled }: CaptureViewProps) {
  const camera = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const isActive = useCameraActive();
  // Negação permanente: o Android para de mostrar o diálogo — só as
  // configurações do app resolvem.
  const [permanentlyDenied, setPermanentlyDenied] = useState(false);

  const askPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      setPermanentlyDenied(true);
    }
  }, [requestPermission]);

  useEffect(() => {
    if (hasPermission) return;
    let cancelled = false;
    requestPermission().then((granted) => {
      if (!granted && !cancelled) {
        setPermanentlyDenied(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasPermission, requestPermission]);

  async function capture() {
    try {
      const photo = await camera.current?.takePhoto();
      if (!photo) {
        onError('Câmera ainda não está pronta.');
        return;
      }
      onPhoto({ uri: `file://${photo.path}`, width: photo.width, height: photo.height });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!device) {
    return (
      <YStack flex={1} items="center" justify="center" p="$4">
        <Paragraph>Nenhuma câmera traseira encontrada neste dispositivo.</Paragraph>
      </YStack>
    );
  }

  if (!hasPermission) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$4" p="$4">
        <Paragraph text="center">Precisamos da câmera para ler as etiquetas de preço.</Paragraph>
        {permanentlyDenied ? (
          <>
            <Paragraph text="center" size="$2" color="$color10">
              O Android bloqueou novos pedidos — habilite a câmera nas configurações do app.
            </Paragraph>
            <Button theme="accent" onPress={() => Linking.openSettings()}>
              Abrir configurações
            </Button>
          </>
        ) : (
          <Button onPress={askPermission}>Permitir câmera</Button>
        )}
      </YStack>
    );
  }

  return (
    <YStack flex={1}>
      <Camera ref={camera} style={StyleSheet.absoluteFill} device={device} isActive={isActive} photo />
      {/* Retículo: enquadre a etiqueta aqui — é o recorte usado no fallback. */}
      <YStack
        position="absolute"
        t={0}
        b={0}
        l={0}
        r={0}
        items="center"
        justify="center"
        pointerEvents="none"
      >
        <YStack
          width="92%"
          aspectRatio={GUIDE_RATIO}
          borderWidth={2}
          borderColor="rgba(255,255,255,0.9)"
          rounded="$4"
        />
      </YStack>
      <YStack position="absolute" b="$6" self="center" items="center" gap="$2">
        <Button size="$6" circular theme="accent" onPress={capture} disabled={disabled} />
      </YStack>
    </YStack>
  );
}
