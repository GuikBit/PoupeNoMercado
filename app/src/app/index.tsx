import { Link } from 'expo-router';
import { Button, H2, Paragraph, YStack } from 'tamagui';

export default function Home() {
  return (
    <YStack flex={1} items="center" justify="center" gap="$4" p="$4">
      <H2>Poupe no Mercado</H2>
      <Paragraph text="center" color="$color10">
        Etapa 0 — fundação. A tela de captura valida câmera + salvamento em disco.
      </Paragraph>
      <Link href="/scan" asChild>
        <Button theme="accent" size="$5">
          Abrir câmera
        </Button>
      </Link>
    </YStack>
  );
}
