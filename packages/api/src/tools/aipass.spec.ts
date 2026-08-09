import { AuthType } from 'librechat-data-provider';
import {
  AIPASS_API_BASE_URL,
  resolveAIPassImageToolAuth,
  type ResolveAIPassImageToolParams,
} from './aipass';

describe('resolveAIPassImageToolAuth', () => {
  const getAIPassToken = jest.fn<Promise<string | null>, [{ userId: string }]>();
  const fetchAIPassModels = jest.fn();

  const createParams = (
    overrides: Partial<ResolveAIPassImageToolParams> = {},
  ): ResolveAIPassImageToolParams => ({
    configuredApiKey: AuthType.AIPASS_OAUTH,
    userId: 'user-1',
    getAIPassToken,
    fetchAIPassModels,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getAIPassToken.mockResolvedValue('user-access-token');
    fetchAIPassModels
      .mockResolvedValueOnce(['nano-banana-2', 'imagen-4-ultra'])
      .mockResolvedValueOnce(['nano-banana-2-edit', 'gpt-image-2-edit']);
  });

  it('keeps ordinary image credentials unchanged', async () => {
    const result = await resolveAIPassImageToolAuth(
      createParams({
        configuredApiKey: 'ordinary-api-key',
        configuredBaseURL: 'https://images.example/v1',
      }),
    );

    expect(result).toEqual({
      apiKey: 'ordinary-api-key',
      baseURL: 'https://images.example/v1',
      usesAIPassOAuth: false,
      generationModels: [],
      editModels: [],
    });
    expect(getAIPassToken).not.toHaveBeenCalled();
    expect(fetchAIPassModels).not.toHaveBeenCalled();
  });

  it('uses the user OAuth token and discovers generation and edit models separately', async () => {
    const result = await resolveAIPassImageToolAuth(createParams());

    expect(getAIPassToken).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(fetchAIPassModels).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        apiKey: 'user-access-token',
        baseURL: AIPASS_API_BASE_URL,
        queryParams: { type: 'image', method: 'image_generation' },
      }),
    );
    expect(fetchAIPassModels).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        apiKey: 'user-access-token',
        baseURL: AIPASS_API_BASE_URL,
        queryParams: { type: 'image', method: 'image_edit' },
      }),
    );
    expect(result).toEqual({
      apiKey: 'user-access-token',
      baseURL: AIPASS_API_BASE_URL,
      usesAIPassOAuth: true,
      generationModels: ['nano-banana-2', 'imagen-4-ultra'],
      editModels: ['nano-banana-2-edit', 'gpt-image-2-edit'],
    });
  });

  it('does not add compatibility headers to catalog requests', async () => {
    await resolveAIPassImageToolAuth(createParams());

    for (const [params] of fetchAIPassModels.mock.calls) {
      expect(params.headers).toBeUndefined();
    }
  });

  it('requires an AI Pass login when the marker is configured', async () => {
    getAIPassToken.mockResolvedValue(null);

    await expect(resolveAIPassImageToolAuth(createParams())).rejects.toThrow(
      'AI Pass authentication required',
    );
    expect(fetchAIPassModels).not.toHaveBeenCalled();
  });
});
