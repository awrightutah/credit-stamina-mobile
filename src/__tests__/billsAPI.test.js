/**
 * billsAPI — security tests
 * Verifies that update and delete always scope queries to the authenticated user.
 * Run: npx jest src/__tests__/billsAPI.test.js
 */

const mockEq    = jest.fn().mockReturnThis();
const mockSelect = jest.fn().mockReturnThis();
const mockSingle = jest.fn().mockResolvedValue({ data: {}, error: null });
const mockUpdate = jest.fn().mockReturnThis();
const mockDelete = jest.fn().mockReturnThis();

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-abc' } } },
      }),
    },
    from: jest.fn(() => ({
      update:  mockUpdate,
      delete:  mockDelete,
      eq:      mockEq,
      select:  mockSelect,
      single:  mockSingle,
    })),
  },
  isRefreshTokenError: () => false,
  clearStoredSession:  jest.fn(),
}));

jest.mock('../config/env', () => ({
  API_URL:           'http://localhost',
  SUPABASE_URL:      'http://localhost',
  SUPABASE_ANON_KEY: 'test',
}));

let billsAPI;
beforeAll(() => {
  billsAPI = require('../services/api').billsAPI;
});

beforeEach(() => jest.clearAllMocks());

describe('billsAPI.update — security', () => {
  it('always filters by user_id', async () => {
    mockEq.mockReturnThis();
    mockSingle.mockResolvedValue({ data: { id: 'bill-1' }, error: null });
    await billsAPI.update('bill-1', { amount: 99 });
    // Should have called .eq('user_id', 'user-abc')
    const calls = mockEq.mock.calls;
    const userIdCall = calls.find(([col, val]) => col === 'user_id' && val === 'user-abc');
    expect(userIdCall).toBeDefined();
  });

  it('throws when not authenticated', async () => {
    const { supabase } = require('../services/supabase');
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(billsAPI.update('bill-1', { amount: 99 })).rejects.toThrow('Not authenticated');
  });
});

describe('billsAPI.delete — security', () => {
  it('always filters by user_id', async () => {
    mockEq.mockReturnThis();
    mockDelete.mockReturnThis();
    // Simulate the final .eq returning a resolved promise
    mockEq.mockImplementation((col) => {
      if (col === 'user_id') return { error: null };
      return { eq: mockEq, error: null };
    });
    await billsAPI.delete('bill-1').catch(() => null); // may resolve or reject — just check calls
    const calls = mockEq.mock.calls;
    const userIdCall = calls.find(([col, val]) => col === 'user_id' && val === 'user-abc');
    expect(userIdCall).toBeDefined();
  });

  it('throws when not authenticated', async () => {
    const { supabase } = require('../services/supabase');
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(billsAPI.delete('bill-1')).rejects.toThrow('Not authenticated');
  });
});
