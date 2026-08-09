jest.mock('@librechat/data-schemas', () => ({
  encryptV2: jest.fn(async (value) => `encrypted:${value}`),
  decryptV2: jest.fn(async (value) => value.replace('encrypted:', '')),
}));

const { encryptV2 } = require('@librechat/data-schemas');
const {
  storeAIPassTokens,
  getValidAIPassAccessToken,
  refreshAIPassTokens,
} = require('./tokenService');

describe('AIPass token service', () => {
  const findByIdAndUpdate = jest.fn();
  const findById = jest.fn();
  const mongoose = {
    models: {
      User: { findById, findByIdAndUpdate },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    findByIdAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'user-1' }) });
  });

  afterAll(() => {
    delete global.fetch;
  });

  it('encrypts OAuth tokens before storing them', async () => {
    await storeAIPassTokens(mongoose, 'user-1', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    expect(encryptV2).toHaveBeenCalledWith('access-token');
    expect(encryptV2).toHaveBeenCalledWith('refresh-token');
    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      'user-1',
      {
        $set: {
          aipassTokens: expect.objectContaining({
            accessToken: 'encrypted:access-token',
            refreshToken: 'encrypted:refresh-token',
            expiresAt: expect.any(Date),
          }),
        },
      },
      { new: true, runValidators: true },
    );
  });

  it('uses a valid stored access token without refreshing it', async () => {
    findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          aipassTokens: {
            accessToken: 'encrypted:access-token',
            refreshToken: 'encrypted:refresh-token',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        }),
      }),
    });

    await expect(getValidAIPassAccessToken(mongoose, 'user-1')).resolves.toBe('access-token');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refreshes using the JSON OAuth contract without a compatibility header', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 7200,
      }),
    });

    await expect(refreshAIPassTokens(mongoose, 'user-1', 'refresh-token')).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      }),
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://aipass.one/oauth2/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantType: 'refresh_token',
          refreshToken: 'refresh-token',
          clientId: process.env.AIPASS_CLIENT_ID,
        }),
      }),
    );
  });
});
