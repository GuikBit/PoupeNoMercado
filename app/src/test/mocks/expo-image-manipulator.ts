/** Stub do expo-image-manipulator para Jest (node). */
export const ImageManipulator = {
  manipulate(): never {
    throw new Error('expo-image-manipulator indisponível em testes');
  },
};

export const SaveFormat = {
  JPEG: 'jpeg',
  PNG: 'png',
  WEBP: 'webp',
} as const;
