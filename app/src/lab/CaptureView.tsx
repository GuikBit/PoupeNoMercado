/**
 * Câmera do Laboratório com o guia visual (retículo) — evolução da tela
 * scan da Etapa 0. A proporção do retículo é a MESMA do fallback do detector.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet } from 'react-native';
import { Camera, type CameraPermissionStatus, useCameraDevice } from 'react-native-vision-camera';
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

/**
 * Estado de permissão baseado na API estática do VisionCamera, reconsultado
 * sempre que o app volta ao primeiro plano — a permissão pode mudar por fora
 * (configurações do sistema) e o hook useCameraPermission não percebe.
 * O pedido automático dispara UMA única vez por mount (nunca em paralelo:
 * um segundo pedido com o diálogo aberto volta "negado" na hora e gerava
 * um falso "negação permanente").
 */
function useCameraPermissionStatus(): {
  status: CameraPermissionStatus;
  request: () => Promise<void>;
} {
  const [status, setStatus] = useState<CameraPermissionStatus>(() =>
    Camera.getCameraPermissionStatus(),
  );
  const requesting = useRef(false);
  const autoRequested = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setStatus(Camera.getCameraPermissionStatus());
      }
    });
    return () => sub.remove();
  }, []);

  const request = useCallback(async () => {
    if (requesting.current) return;
    requesting.current = true;
    try {
      await Camera.requestCameraPermission();
    } finally {
      requesting.current = false;
      setStatus(Camera.getCameraPermissionStatus());
    }
  }, []);

  useEffect(() => {
    if (status === 'not-determined' && !autoRequested.current) {
      autoRequested.current = true;
      request();
    }
  }, [status, request]);

  return { status, request };
}

export function CaptureView({ onPhoto, onError, disabled }: CaptureViewProps) {
  const camera = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { status, request } = useCameraPermissionStatus();
  const isActive = useCameraActive();

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

  if (status !== 'granted') {
    return (
      <YStack flex={1} items="center" justify="center" gap="$4" p="$4">
        <Paragraph text="center">Precisamos da câmera para ler as etiquetas de preço.</Paragraph>
        {status === 'denied' || status === 'restricted' ? (
          <>
            <Button onPress={request}>Permitir câmera</Button>
            <Paragraph text="center" size="$2" color="$color10">
              Se o diálogo não aparecer, habilite a câmera nas configurações do app.
            </Paragraph>
            <Button theme="accent" onPress={() => Linking.openSettings()}>
              Abrir configurações
            </Button>
          </>
        ) : (
          <Button onPress={request}>Permitir câmera</Button>
        )}
      </YStack>
    );
  }

  return (
    <YStack flex={1}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        photo
      />
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
