import { defaultConfig } from '@tamagui/config/v4';
import { createTamagui } from 'tamagui';

// Tema base — customização visual virá nas etapas de UI (Etapa 5).
export const tamaguiConfig = createTamagui(defaultConfig);

export type AppConfig = typeof tamaguiConfig;

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}
