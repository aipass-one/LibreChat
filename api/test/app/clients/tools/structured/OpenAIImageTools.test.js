const OpenAI = require('openai');
const axios = require('axios');
const { Readable } = require('stream');
const createOpenAIImageTools = require('~/app/clients/tools/structured/OpenAIImageTools');
const {
  getStrategyFunctions: mockGetStrategyFunctions,
} = require('~/server/services/Files/strategies');

jest.mock('openai');
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(),
  oaiToolkit: {
    image_gen_oai: {
      name: 'image_gen_oai',
      description: 'Generate an image',
      schema: {},
    },
    image_edit_oai: {
      name: 'image_edit_oai',
      description: 'Edit an image',
      schema: {},
    },
  },
  extractBaseURL: jest.fn((url) => url),
  getProxyDispatcher: jest.fn(() => undefined),
  applyAxiosProxyConfig: jest.fn(),
  AIPASS_DEFAULT_IMAGE_GENERATION_MODEL: 'nano-banana-2',
  AIPASS_DEFAULT_IMAGE_EDIT_MODEL: 'nano-banana-2-edit',
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/models', () => ({
  getFiles: jest.fn().mockResolvedValue([]),
}));

describe('OpenAIImageTools - IMAGE_GEN_OAI_MODEL environment variable', () => {
  let originalEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };

    process.env.IMAGE_GEN_OAI_API_KEY = 'test-api-key';

    OpenAI.mockImplementation(() => ({
      images: {
        generate: jest.fn().mockResolvedValue({
          data: [
            {
              b64_json: 'base64-encoded-image-data',
            },
          ],
        }),
      },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('should use default model "gpt-image-1" when IMAGE_GEN_OAI_MODEL is not set', async () => {
    delete process.env.IMAGE_GEN_OAI_MODEL;

    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      override: false,
      req: { user: { id: 'test-user' } },
    });

    const mockGenerate = jest.fn().mockResolvedValue({
      data: [
        {
          b64_json: 'base64-encoded-image-data',
        },
      ],
    });

    OpenAI.mockImplementation(() => ({
      images: {
        generate: mockGenerate,
      },
    }));

    await imageGenTool.func({ prompt: 'test prompt' });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-1',
      }),
      expect.any(Object),
    );
  });

  it('should use "gpt-image-1.5" when IMAGE_GEN_OAI_MODEL is set to "gpt-image-1.5"', async () => {
    process.env.IMAGE_GEN_OAI_MODEL = 'gpt-image-1.5';

    const mockGenerate = jest.fn().mockResolvedValue({
      data: [
        {
          b64_json: 'base64-encoded-image-data',
        },
      ],
    });

    OpenAI.mockImplementation(() => ({
      images: {
        generate: mockGenerate,
      },
    }));

    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      override: false,
      req: { user: { id: 'test-user' } },
    });

    await imageGenTool.func({ prompt: 'test prompt' });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-1.5',
      }),
      expect.any(Object),
    );
  });

  it('should use custom model name from IMAGE_GEN_OAI_MODEL environment variable', async () => {
    process.env.IMAGE_GEN_OAI_MODEL = 'custom-image-model';

    const mockGenerate = jest.fn().mockResolvedValue({
      data: [
        {
          b64_json: 'base64-encoded-image-data',
        },
      ],
    });

    OpenAI.mockImplementation(() => ({
      images: {
        generate: mockGenerate,
      },
    }));

    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      override: false,
      req: { user: { id: 'test-user' } },
    });

    await imageGenTool.func({ prompt: 'test prompt' });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'custom-image-model',
      }),
      expect.any(Object),
    );
  });

  it('uses a discovered AI Pass model selected by the agent', async () => {
    delete process.env.IMAGE_GEN_OAI_MODEL;
    const mockGenerate = jest.fn().mockResolvedValue({
      data: [{ url: 'https://cdn.example/generated.png' }],
    });
    OpenAI.mockImplementation(() => ({ images: { generate: mockGenerate } }));

    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      req: { user: { id: 'test-user' } },
      usesAIPassOAuth: true,
      IMAGE_GEN_OAI_API_KEY: 'user-oauth-token',
      IMAGE_GEN_OAI_BASEURL: 'https://aipass.one/v1',
      imageGenerationModels: ['nano-banana-2', 'imagen-4-ultra'],
    });

    const result = await imageGenTool.func({
      model: 'imagen-4-ultra',
      prompt: 'a city at sunset',
    });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'imagen-4-ultra' }),
      expect.any(Object),
    );
    expect(result[1].content[0].image_url.url).toBe('https://cdn.example/generated.png');
  });

  it('uses the preferred AI Pass model when no image model is requested', async () => {
    delete process.env.IMAGE_GEN_OAI_MODEL;
    const mockGenerate = jest.fn().mockResolvedValue({
      data: [{ b64_json: 'generated-image' }],
    });
    OpenAI.mockImplementation(() => ({ images: { generate: mockGenerate } }));

    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      req: { user: { id: 'test-user' } },
      usesAIPassOAuth: true,
      IMAGE_GEN_OAI_API_KEY: 'user-oauth-token',
      imageGenerationModels: ['imagen-4-ultra', 'nano-banana-2'],
    });

    await imageGenTool.func({ prompt: 'a lighthouse' });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'nano-banana-2' }),
      expect.any(Object),
    );
  });

  it('falls back to the stable AI Pass model when catalog discovery is unavailable', async () => {
    delete process.env.IMAGE_GEN_OAI_MODEL;
    const mockGenerate = jest.fn().mockResolvedValue({
      data: [{ b64_json: 'generated-image' }],
    });
    OpenAI.mockImplementation(() => ({ images: { generate: mockGenerate } }));

    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      req: { user: { id: 'test-user' } },
      usesAIPassOAuth: true,
      IMAGE_GEN_OAI_API_KEY: 'user-oauth-token',
      imageGenerationModels: [],
    });

    await imageGenTool.func({ prompt: 'a lighthouse' });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'nano-banana-2' }),
      expect.any(Object),
    );
  });

  it('passes a request-scoped AI Pass base URL to the OpenAI-compatible client', async () => {
    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      req: { user: { id: 'test-user' } },
      IMAGE_GEN_OAI_API_KEY: 'user-oauth-token',
      IMAGE_GEN_OAI_BASEURL: 'https://aipass.one/v1',
    });

    await imageGenTool.func({ prompt: 'a mountain' });

    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'user-oauth-token',
        baseURL: 'https://aipass.one/v1',
      }),
    );
  });

  it('uses the AI Pass edit catalog, multipart field, and URL response', async () => {
    delete process.env.IMAGE_EDIT_OAI_MODEL;
    mockGetStrategyFunctions.mockReturnValue({
      getDownloadStream: jest.fn().mockResolvedValue(Readable.from(Buffer.from('image-bytes'))),
    });
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { data: [{ url: 'https://cdn.example/edited.png' }] },
    });

    const [, imageEditTool] = createOpenAIImageTools({
      isAgent: true,
      req: { user: { id: 'test-user' } },
      usesAIPassOAuth: true,
      IMAGE_GEN_OAI_API_KEY: 'user-oauth-token',
      IMAGE_GEN_OAI_BASEURL: 'https://aipass.one/v1',
      imageEditModels: ['gpt-image-2-edit', 'nano-banana-2-edit'],
      imageFiles: [
        {
          file_id: 'image-1',
          source: 'local',
          filepath: '/uploads/image.png',
          filename: 'image.png',
          type: 'image/png',
        },
      ],
    });

    const result = await imageEditTool.func({
      prompt: 'make the sky blue',
      image_ids: ['image-1'],
    });

    const formData = post.mock.calls[0][1];
    const multipartHeaders = formData._streams.filter((part) => typeof part === 'string').join('');
    expect(multipartHeaders).toContain('name="image"');
    expect(multipartHeaders).not.toContain('name="image[]"');
    expect(multipartHeaders).toContain('nano-banana-2-edit');
    expect(result[1].content[0].image_url.url).toBe('https://cdn.example/edited.png');
  });
});
