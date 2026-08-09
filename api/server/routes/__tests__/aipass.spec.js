const express = require('express');
const request = require('supertest');

const mockGetValidAIPassAccessToken = jest.fn();
const mockLogger = {
  warn: jest.fn(),
};

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'librechat-user-1' };
    next();
  },
}));

jest.mock('~/server/services/AIPass', () => ({
  getValidAIPassAccessToken: (...args) => mockGetValidAIPassAccessToken(...args),
}));

describe('AI Pass routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use('/api/aipass', require('../aipass'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    delete global.fetch;
  });

  it('returns the authoritative AI Pass balance without exposing the OAuth token', async () => {
    mockGetValidAIPassAccessToken.mockResolvedValue('provider-access-token');
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: {
          totalCost: 1.25,
          maxBudget: 10,
          remainingBudget: 8.75,
        },
      }),
    });

    const response = await request(app).get('/api/aipass/balance');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      totalCost: 1.25,
      maxBudget: 10,
      remainingBudget: 8.75,
      currency: 'USD',
    });
    expect(JSON.stringify(response.body)).not.toContain('provider-access-token');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://aipass.one/api/v1/usage/me/summary',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer provider-access-token',
        },
      }),
    );
  });

  it('returns no content when the LibreChat user has no AI Pass connection', async () => {
    mockGetValidAIPassAccessToken.mockResolvedValue(null);

    const response = await request(app).get('/api/aipass/balance');

    expect(response.status).toBe(204);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns a safe error when AI Pass rejects the balance request', async () => {
    mockGetValidAIPassAccessToken.mockResolvedValue('provider-access-token');
    global.fetch.mockResolvedValue({ ok: false, status: 401 });

    const response = await request(app).get('/api/aipass/balance');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'AI Pass balance is temporarily unavailable' });
    expect(mockLogger.warn).toHaveBeenCalledWith('[AIPass balance] Upstream request failed', {
      status: 401,
    });
  });

  it('rejects malformed balance amounts', async () => {
    mockGetValidAIPassAccessToken.mockResolvedValue('provider-access-token');
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: { remainingBudget: 'not-a-number' } }),
    });

    const response = await request(app).get('/api/aipass/balance');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'AI Pass balance is temporarily unavailable' });
  });
});
