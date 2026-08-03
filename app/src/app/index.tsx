import { Link } from 'expo-router';
import { Button, H2, Paragraph, YStack } from 'tamagui';

export default function Home() {
  return (
    <YStack flex={1} items="center" justify="center" gap="$4" p="$4">
      <H2>Poupe no Mercado</H2>
      <Paragraph text="center" color="$color10">
        Fase 0 — Laboratório de Etiquetas: compara ML Kit e Cloud Vision no mesmo frame para
        decidir o motor de OCR.
      </Paragraph>
      <Link href="/lab" asChild>
        <Button theme="accent" size="$5">
          Abrir Laboratório
        </Button>
      </Link>
    </YStack>
  );
}
