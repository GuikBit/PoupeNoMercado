import { NativeModule, requireNativeModule } from 'expo';

import type { MlkitRecognizeResponse } from './MlkitTextRecognition.types';

declare class MlkitTextRecognitionModule extends NativeModule {
  /** OCR on-device sobre uma foto em disco. `uri` deve ser um file URI. */
  recognize(uri: string): Promise<MlkitRecognizeResponse>;
}

export default requireNativeModule<MlkitTextRecognitionModule>('MlkitTextRecognition');
