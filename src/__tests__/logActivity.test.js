/**
 * logActivity — unit tests
 * Verifies it never throws and handles missing session gracefully.
 * Run: npx jest src/__tests__/logActivity.test.js
 */

// Mock supabase so no real network calls happen
jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    from: jest.fn(() => ({
      insert: jest.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

// Must come after the mock
const { supabase } = require('../services/supabase');

// logActivity is a named export — import after mocking
let logActivity;
beforeAll(() => {
  // Dynamically import so the mock is in place first
  logActivity = require('../services/api').logActivity;
});

describe('logActivity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not throw when session is missing', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(logActivity('test_event', 'Test')).resolves.toBeUndefined();
  });

  it('does not throw when supabase insert fails', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });
    supabase.from.mockReturnValue({
      insert: jest.fn(() => Promise.reject(new Error('DB error'))),
    });
    await expect(logActivity('test_event', 'Test')).resolves.toBeUndefined();
  });

  it('does not throw when getSession itself throws', async () => {
    supabase.auth.getSession.mockRejectedValue(new Error('Network error'));
    await expect(logActivity('test_event', 'Test')).resolves.toBeUndefined();
  });
});
