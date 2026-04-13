// Jest global setup — runs before each test file
// Silence expected console.warn / console.error noise from mocked modules
global.console = {
  ...console,
  warn:  jest.fn(),
  error: jest.fn(),
  log:   console.log, // keep logs visible
};
