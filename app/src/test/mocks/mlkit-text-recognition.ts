/**
 * Stub do módulo nativo ML Kit para Jest (node).
 * Testes de adaptador injetam `recognizeFn` — este stub só falha alto se algo
 * tentar tocar o módulo nativo de verdade fora do device.
 */
export const MlkitTextRecognition = {
  recognize(_uri: string): Promise<never> {
    throw new Error('Módulo nativo ML Kit indisponível em testes — injete recognizeFn');
  },
};
