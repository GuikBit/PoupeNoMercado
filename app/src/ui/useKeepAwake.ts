/**
 * Mantém a tela ligada durante a compra (5.3).
 *
 * Sem isso o celular apaga entre um item e outro e a pessoa desbloqueia
 * dezenas de vezes por compra — no supermercado, com a mão ocupada, é o
 * suficiente para desistir do app.
 *
 * Ativa só enquanto a tela está em foco: manter ligado depois de sair da
 * compra seria queimar bateria alheia.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

const TAG = 'compra-ativa';

export function useKeepAwakeDuringTrip(enabled = true): void {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      // Best-effort: em APK sem o módulo nativo isso falha e o app segue.
      activateKeepAwakeAsync(TAG).catch(() => undefined);
      return () => {
        try {
          deactivateKeepAwake(TAG);
        } catch {
          // idem
        }
      };
    }, [enabled]),
  );
}
