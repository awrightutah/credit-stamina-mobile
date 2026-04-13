module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFiles: ['./src/__tests__/setup.js'],
  moduleNameMapper: {
    // Mock native modules that can't run in Node
    '@react-native-async-storage/async-storage':
      '<rootDir>/src/__tests__/__mocks__/asyncStorage.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|@supabase)/)',
  ],
};
