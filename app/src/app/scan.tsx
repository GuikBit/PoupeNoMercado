import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Button, Paragraph, YStack } from 'tamagui';

/**
 * Ponto de verificação da Etapa 0: preview da câmera + captura de foto
 * salva em FileSystem.documentDirectory/captures/.
 * Esta tela evolui para a tela do Laboratório na Etapa 1.
 */
export default function Scan() {
  const camera = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  async function capture() {
    try {
      setError(null);
      const photo = await camera.current?.takePhoto();
      if (!photo) {
        setError('Câmera ainda não está pronta.');
        return;
      }
      const capturesDir = new Directory(Paths.document, 'captures');
      if (!capturesDir.exists) {
        capturesDir.create();
      }
      const file = new File(`file://${photo.path}`);
      file.move(capturesDir);
      setSavedUri(file.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        <Paragraph text="center">
          Precisamos da câmera para ler as etiquetas de preço.
        </Paragraph>
        <Button onPress={requestPermission}>Permitir câmera</Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo
      />
      <YStack position="absolute" b="$6" self="center" items="center" gap="$2">
        <Button size="$6" circular theme="accent" onPress={capture} />
        {savedUri ? (
          <Paragraph size="$2" color="white">
            Salva em {savedUri.split('/').slice(-2).join('/')}
          </Paragraph>
        ) : null}
        {error ? (
          <Paragraph size="$2" color="$red10">
            {error}
          </Paragraph>
        ) : null}
      </YStack>
    </YStack>
  );
}
