/**
 * Feedback tátil da leitura (5.3).
 *
 * No corredor o usuário está olhando a gôndola, não a tela. A vibração é o que
 * diz "li e registrei" sem exigir que ele confira o celular a cada item.
 *
 * ⚠️ Tudo aqui é **best-effort**: vibração é enfeite, e enfeite jamais derruba
 * o fluxo. Aparelho sem motor háptico, permissão negada ou módulo nativo
 * ausente (APK antigo) devem passar batido, não estourar.
 */
import * as Haptics from 'expo-haptics';

type Resultado = 'lido' | 'confirmado' | 'falhou';

async function seguro(acao: () => Promise<void>): Promise<void> {
  try {
    await acao();
  } catch {
    // Silêncio proposital: ver o aviso acima.
  }
}

/**
 * `lido` — leitura chegou, ainda vai ser confirmada (toque leve).
 * `confirmado` — item entrou no carrinho (toque de sucesso).
 * `falhou` — não deu para ler, vai cair no manual (toque de aviso).
 */
export async function vibrar(resultado: Resultado): Promise<void> {
  await seguro(async () => {
    switch (resultado) {
      case 'lido':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case 'confirmado':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      case 'falhou':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
    }
  });
}
