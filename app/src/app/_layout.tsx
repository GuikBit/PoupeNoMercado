import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TamaguiProvider } from 'tamagui';

import { tamaguiConfig } from '../../tamagui.config';

export default function RootLayout() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Poupe no Mercado' }} />
        <Stack.Screen name="lists" options={{ title: 'Listas' }} />
        <Stack.Screen name="trip" options={{ title: 'Compra' }} />
        <Stack.Screen name="summary" options={{ title: 'Resumo da compra' }} />
        {/* Sem cabeçalho: a câmera ocupa a tela toda e os controles flutuam. */}
        <Stack.Screen name="scan" options={{ title: 'Escanear', headerShown: false }} />
        <Stack.Screen name="lab" options={{ title: 'Laboratório de Etiquetas' }} />
      </Stack>
    </TamaguiProvider>
  );
}
