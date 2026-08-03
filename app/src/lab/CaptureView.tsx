/**
 * Câmera do Laboratório com o guia visual (retículo) — evolução da tela
 * scan da Etapa 0. A proporção do retículo é a MESMA do fallback do detector.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Button, Paragraph, YStack } from 'tamagui';

import { GUIDE_RATIO } from '../ocr/detector/geometry';
import type { ImageRef } from '../ocr/types';

interface CaptureViewProps {
  onPhoto: (photo: ImageRef) => void;
  onError: (message: string) => void;
  disabled: boolean;
}

export function CaptureView({ onPhoto, onError, disabled }: CaptureViewProps) {
  const camera = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
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
        <Button onPress={requestPermission}>Permitir câmera</Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1}>
      <Camera ref={camera} style={StyleSheet.absoluteFill} device={device} isActive photo />
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
