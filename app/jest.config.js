/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-file-system$': '<rootDir>/src/test/mocks/expo-file-system.ts',
    '^expo-image-manipulator$': '<rootDir>/src/test/mocks/expo-image-manipulator.ts',
    '^react-native-fast-opencv$': '<rootDir>/src/test/mocks/react-native-fast-opencv.ts',
    'modules/mlkit-text-recognition$': '<rootDir>/src/test/mocks/mlkit-text-recognition.ts',
  },
};
