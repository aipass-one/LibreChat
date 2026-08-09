import { AuthType } from 'librechat-data-provider';
import {
  AIPASS_API_BASE_URL,
  resolveAIPassImageToolAuth,
  type ResolveAIPassImageToolParams,
} from './aipass';
import {
  createAIPassWebSearchTool,
  extractAIPassWebSearchResult,
  type CreateAIPassWebSearchToolParams,
} from './aipassWebSearch';

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

describe('AI Pass delegated Gemini web search', () => {
  const responsePayload = {
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: 'Spain won Euro 2024.',
            annotations: [
              {
                type: 'url_citation',
                url: 'https://www.uefa.com/euro2024/',
                title: 'UEFA',
                start_index: 0,
                end_index: 20,
              },
              {
                type: 'url_citation',
                url_citation: {
                  url: 'https://www.uefa.com/euro2024/',
                  title: 'Duplicate UEFA',
                },
              },
              { type: 'url_citation', url: 'javascript:alert(1)', title: 'Unsafe' },
            ],
          },
        ],
      },
    ],
  };

  it('extracts and deduplicates grounded response citations', () => {
    expect(extractAIPassWebSearchResult(responsePayload)).toEqual({
      text: 'Spain won Euro 2024.',
      sources: [
        {
          title: 'UEFA',
          link: 'https://www.uefa.com/euro2024/',
          snippet: 'Spain won Euro 2024.',
          processed: true,
        },
      ],
    });
  });

  it('calls AI Pass Responses with Gemini web search and exposes source artifacts', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const onSearchResults = jest.fn();
    const params: CreateAIPassWebSearchToolParams = {
      apiKey: 'oauth-token',
      baseURL: 'https://aipass.one/v1/',
      searchModel: 'gemini-3.5-flash-lite',
      fetchFn,
      onSearchResults,
    };
    const searchTool = createAIPassWebSearchTool(params);

    const output = await searchTool.invoke({ query: 'Who won Euro 2024?' });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://aipass.one/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer oauth-token',
          'Content-Type': 'application/json',
        },
      }),
    );
    const request = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    expect(request).toEqual(
      expect.objectContaining({
        model: 'gemini-3.5-flash-lite',
        tools: [{ type: 'web_search' }],
      }),
    );
    expect(request.input).toContain('Who won Euro 2024?');
    expect(String(output)).toContain('Gemini Google Search research');
    expect(String(output)).toContain('UEFA');
    expect(onSearchResults).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          organic: [expect.objectContaining({ link: 'https://www.uefa.com/euro2024/' })],
        }),
      }),
      expect.any(Object),
    );
  });

  it('does not expose upstream response bodies when AI Pass returns an error', async () => {
    const searchTool = createAIPassWebSearchTool({
      apiKey: 'oauth-token',
      baseURL: 'https://aipass.one/v1',
      searchModel: 'gemini-3.5-flash-lite',
      fetchFn: jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'sensitive upstream detail' } }), {
          status: 502,
        }),
      ),
    });

    await expect(searchTool.invoke({ query: 'latest news' })).rejects.toThrow(
      'AI Pass Gemini search failed with HTTP 502',
    );
  });
});
