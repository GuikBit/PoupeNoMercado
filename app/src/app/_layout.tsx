/**
 * Raiz da navegação.
 *
 * `SafeAreaProvider` envolve tudo porque a tela de escaneamento roda SEM
 * cabeçalho (a câmera ocupa a tela inteira) e precisa do inset real da barra
 * de status — chutar um valor fixo dá errado em aparelho com notch, ilha ou
 * barra de altura diferente.
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';

import { tamaguiConfig } from '../../tamagui.config';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerBackTitle: 'Voltar' }}>
          <Stack.Screen name="index" options={{ title: 'Poupe no Mercado' }} />
          <Stack.Screen name="lists" options={{ title: 'Listas' }} />
          <Stack.Screen name="trip" options={{ title: 'Compra' }} />
          <Stack.Screen name="summary" options={{ title: 'Resumo da compra' }} />
          <Stack.Screen name="history" options={{ title: 'Histórico' }} />
          <Stack.Screen name="settings" options={{ title: 'Configurações' }} />
          {/* Único sem cabeçalho: a câmera ocupa a tela toda e os controles
              flutuam por cima. Os passos internos usam useSafeAreaInsets. */}
          <Stack.Screen name="scan" options={{ title: 'Escanear', headerShown: false }} />
          <Stack.Screen name="lab" options={{ title: 'Laboratório de Etiquetas' }} />
        </Stack>
      </TamaguiProvider>
    </SafeAreaProvider>
  );
}
