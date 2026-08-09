const axios = require('axios');
const { v4 } = require('uuid');
const OpenAI = require('openai');
const FormData = require('form-data');
const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const { ContentTypes, EImageOutputType } = require('librechat-data-provider');
const {
  logAxiosError,
  oaiToolkit,
  extractBaseURL,
  getProxyDispatcher,
  applyAxiosProxyConfig,
  AIPASS_DEFAULT_IMAGE_EDIT_MODEL,
  AIPASS_DEFAULT_IMAGE_GENERATION_MODEL,
} = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFiles } = require('~/models');

const displayMessage =
  "The tool displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.";

/**
 * Replaces unwanted characters from the input string
 * @param {string} inputString - The input string to process
 * @returns {string} - The processed string
 */
function replaceUnwantedChars(inputString) {
  return inputString
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/"/g, '')
    .trim();
}

function returnValue(value) {
  if (typeof value === 'string') {
    return [value, {}];
  } else if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value;
    }
    return [displayMessage, value];
  }
  return value;
}

function createAbortHandler() {
  return function () {
    logger.debug('[ImageGenOAI] Image generation aborted');
  };
}

/**
 * @param {string | undefined} configuredModel
 * @param {string[]} availableModels
 * @param {string} preferredModel
 * @param {string} fallbackModel
 * @returns {string}
 */
function resolveDefaultModel(configuredModel, availableModels, preferredModel, fallbackModel) {
  if (configuredModel) {
    return configuredModel;
  }
  if (availableModels.includes(preferredModel)) {
    return preferredModel;
  }
  return availableModels[0] || fallbackModel;
}

/**
 * @param {Object} toolkit
 * @param {string[]} availableModels
 * @param {string} defaultModel
 * @returns {Object}
 */
function addModelSelection(toolkit, availableModels, defaultModel) {
  if (availableModels.length === 0) {
    return toolkit;
  }

  return {
    ...toolkit,
    schema: {
      ...toolkit.schema,
      properties: {
        ...toolkit.schema.properties,
        model: {
          type: 'string',
          enum: availableModels,
          description: `AI Pass image model to use. Defaults to ${defaultModel}.`,
        },
      },
    },
  };
}

/**
 * @param {string | undefined} requestedModel
 * @param {string[]} availableModels
 * @param {string} defaultModel
 * @returns {string}
 */
function selectModel(requestedModel, availableModels, defaultModel) {
  if (!requestedModel) {
    return defaultModel;
  }
  if (availableModels.length > 0 && !availableModels.includes(requestedModel)) {
    throw new Error(`Image model "${requestedModel}" is not available through AI Pass.`);
  }
  return requestedModel;
}

/**
 * @param {{ b64_json?: string, url?: string } | undefined} image
 * @param {string} outputFormat
 * @returns {string | null}
 */
function resolveImageURL(image, outputFormat) {
  if (image?.b64_json) {
    return `data:image/${outputFormat};base64,${image.b64_json}`;
  }
  return image?.url || null;
}

/**
 * Creates OpenAI Image tools (generation and editing)
 * @param {Object} fields - Configuration fields
 * @param {ServerRequest} fields.req - Whether the tool is being used in an agent context
 * @param {boolean} fields.isAgent - Whether the tool is being used in an agent context
 * @param {string} fields.IMAGE_GEN_OAI_API_KEY - The OpenAI API key
 * @param {string} [fields.IMAGE_GEN_OAI_BASEURL] - Request-scoped image API base URL
 * @param {boolean} [fields.usesAIPassOAuth] - Whether the key came from AI Pass OAuth
 * @param {string[]} [fields.imageGenerationModels] - Available AI Pass generation models
 * @param {string[]} [fields.imageEditModels] - Available AI Pass editing models
 * @param {boolean} [fields.override] - Whether to override the API key check, necessary for app initialization
 * @param {MongoFile[]} [fields.imageFiles] - The images to be used for editing
 * @param {string} [fields.imageOutputType] - The image output type configuration
 * @param {string} [fields.fileStrategy] - The file storage strategy
 * @returns {Array<ReturnType<tool>>} - Array of image tools
 */
function createOpenAIImageTools(fields = {}) {
  /** @type {boolean} Used to initialize the Tool without necessary variables. */
  const override = fields.override ?? false;
  /** @type {boolean} */
  if (!override && !fields.isAgent) {
    throw new Error('This tool is only available for agents.');
  }
  const { req } = fields;
  const imageOutputType = fields.imageOutputType || EImageOutputType.PNG;
  const appFileStrategy = fields.fileStrategy;

  const getApiKey = () => {
    const apiKey = process.env.IMAGE_GEN_OAI_API_KEY ?? '';
    if (!apiKey && !override) {
      throw new Error('Missing IMAGE_GEN_OAI_API_KEY environment variable.');
    }
    return apiKey;
  };

  const apiKey = fields.IMAGE_GEN_OAI_API_KEY ?? getApiKey();
  const closureConfig = { apiKey };

  const usesAIPassOAuth = fields.usesAIPassOAuth === true;
  const imageGenerationModels = fields.imageGenerationModels ?? [];
  const imageEditModels = fields.imageEditModels ?? [];
  const imageModel = resolveDefaultModel(
    process.env.IMAGE_GEN_OAI_MODEL,
    imageGenerationModels,
    AIPASS_DEFAULT_IMAGE_GENERATION_MODEL,
    usesAIPassOAuth ? AIPASS_DEFAULT_IMAGE_GENERATION_MODEL : 'gpt-image-1',
  );
  const imageEditModel = resolveDefaultModel(
    process.env.IMAGE_EDIT_OAI_MODEL,
    imageEditModels,
    AIPASS_DEFAULT_IMAGE_EDIT_MODEL,
    usesAIPassOAuth ? AIPASS_DEFAULT_IMAGE_EDIT_MODEL : imageModel,
  );

  let baseURL = 'https://api.openai.com/v1/';
  const configuredBaseURL = fields.IMAGE_GEN_OAI_BASEURL ?? process.env.IMAGE_GEN_OAI_BASEURL;
  if (!override && configuredBaseURL) {
    baseURL = extractBaseURL(configuredBaseURL);
    closureConfig.baseURL = baseURL;
  }

  // Note: Azure may not yet support the latest image generation models
  if (
    !override &&
    process.env.IMAGE_GEN_OAI_AZURE_API_VERSION &&
    process.env.IMAGE_GEN_OAI_BASEURL
  ) {
    baseURL = process.env.IMAGE_GEN_OAI_BASEURL;
    closureConfig.baseURL = baseURL;
    closureConfig.defaultQuery = { 'api-version': process.env.IMAGE_GEN_OAI_AZURE_API_VERSION };
    closureConfig.defaultHeaders = {
      'api-key': process.env.IMAGE_GEN_OAI_API_KEY,
      'Content-Type': 'application/json',
    };
    closureConfig.apiKey = process.env.IMAGE_GEN_OAI_API_KEY;
  }

  const imageFiles = fields.imageFiles ?? [];

  /**
   * Image Generation Tool
   */
  const imageGenTool = tool(
    async (
      {
        model,
        prompt,
        background = 'auto',
        n = 1,
        output_compression = 100,
        quality = 'auto',
        size = 'auto',
      },
      runnableConfig,
    ) => {
      if (!prompt) {
        throw new Error('Missing required field: prompt');
      }
      const clientConfig = { ...closureConfig };
      const proxyDispatcher = getProxyDispatcher();
      if (proxyDispatcher) {
        clientConfig.fetchOptions = {
          dispatcher: proxyDispatcher,
        };
      }

      /** @type {OpenAI} */
      const openai = new OpenAI(clientConfig);
      let output_format = imageOutputType;
      if (
        background === 'transparent' &&
        output_format !== EImageOutputType.PNG &&
        output_format !== EImageOutputType.WEBP
      ) {
        logger.warn(
          '[ImageGenOAI] Transparent background requires PNG or WebP format, defaulting to PNG',
        );
        output_format = EImageOutputType.PNG;
      }

      let resp;
      /** @type {AbortSignal} */
      let derivedSignal = null;
      /** @type {() => void} */
      let abortHandler = null;

      try {
        if (runnableConfig?.signal) {
          derivedSignal = AbortSignal.any([runnableConfig.signal]);
          abortHandler = createAbortHandler();
          derivedSignal.addEventListener('abort', abortHandler, { once: true });
        }

        resp = await openai.images.generate(
          {
            model: selectModel(model, imageGenerationModels, imageModel),
            prompt: replaceUnwantedChars(prompt),
            n: Math.min(Math.max(1, n), 10),
            background,
            output_format,
            output_compression:
              output_format === EImageOutputType.WEBP || output_format === EImageOutputType.JPEG
                ? output_compression
                : undefined,
            quality,
            size,
          },
          {
            signal: derivedSignal,
          },
        );
      } catch (error) {
        const message = '[image_gen_oai] Problem generating the image:';
        logAxiosError({ error, message });
        return returnValue(`Something went wrong when trying to generate the image. The image API may be unavailable:
Error Message: ${error.message}`);
      } finally {
        if (abortHandler && derivedSignal) {
          derivedSignal.removeEventListener('abort', abortHandler);
        }
      }

      if (!resp) {
        return returnValue(
          'Something went wrong when trying to generate the image. The image API may be unavailable',
        );
      }

      // TODO: handle cost in `resp.usage`
      const imageURL = resolveImageURL(resp.data?.[0], output_format);
      if (!imageURL) {
        return returnValue(
          'No image data returned from the image API. There may be a problem with the provider or your configuration.',
        );
      }

      const content = [
        {
          type: ContentTypes.IMAGE_URL,
          image_url: {
            url: imageURL,
          },
        },
      ];

      const file_ids = [v4()];
      const response = [
        {
          type: ContentTypes.TEXT,
          text: displayMessage + `\n\ngenerated_image_id: "${file_ids[0]}"`,
        },
      ];
      return [response, { content, file_ids }];
    },
    addModelSelection(oaiToolkit.image_gen_oai, imageGenerationModels, imageModel),
  );

  /**
   * Image Editing Tool
   */
  const imageEditTool = tool(
    async ({ model, prompt, image_ids, quality = 'auto', size = 'auto' }, runnableConfig) => {
      if (!prompt) {
        throw new Error('Missing required field: prompt');
      }

      const clientConfig = { ...closureConfig };
      const proxyDispatcher = getProxyDispatcher();
      if (proxyDispatcher) {
        clientConfig.fetchOptions = {
          dispatcher: proxyDispatcher,
        };
      }

      const formData = new FormData();
      formData.append('model', selectModel(model, imageEditModels, imageEditModel));
      formData.append('prompt', replaceUnwantedChars(prompt));
      // TODO: `mask` support
      // formData.append('n', n.toString());
      formData.append('quality', quality);
      formData.append('size', size);

      /** @type {Record<FileSources, undefined | NodeStreamDownloader<File>>} */
      const streamMethods = {};

      const requestFilesMap = Object.fromEntries(imageFiles.map((f) => [f.file_id, { ...f }]));

      const orderedFiles = new Array(image_ids.length);
      const idsToFetch = [];
      const indexOfMissing = Object.create(null);

      for (let i = 0; i < image_ids.length; i++) {
        const id = image_ids[i];
        const file = requestFilesMap[id];

        if (file) {
          orderedFiles[i] = file;
        } else {
          idsToFetch.push(id);
          indexOfMissing[id] = i;
        }
      }

      if (idsToFetch.length) {
        const fetchedFiles = await getFiles(
          {
            user: req.user.id,
            file_id: { $in: idsToFetch },
            height: { $exists: true },
            width: { $exists: true },
          },
          {},
          {},
        );

        for (const file of fetchedFiles) {
          requestFilesMap[file.file_id] = file;
          orderedFiles[indexOfMissing[file.file_id]] = file;
        }
      }
      for (const imageFile of orderedFiles) {
        if (!imageFile) {
          continue;
        }
        /** @type {NodeStream<File>} */
        let stream;
        /** @type {NodeStreamDownloader<File>} */
        let getDownloadStream;
        const source = imageFile.source || appFileStrategy;
        if (!source) {
          throw new Error('No source found for image file');
        }
        if (streamMethods[source]) {
          getDownloadStream = streamMethods[source];
        } else {
          ({ getDownloadStream } = getStrategyFunctions(source));
          streamMethods[source] = getDownloadStream;
        }
        if (!getDownloadStream) {
          throw new Error(`No download stream method found for source: ${source}`);
        }
        stream = await getDownloadStream(req, imageFile.filepath);
        if (!stream) {
          throw new Error('Failed to get download stream for image file');
        }
        formData.append(usesAIPassOAuth ? 'image' : 'image[]', stream, {
          filename: imageFile.filename,
          contentType: imageFile.type,
        });
      }

      /** @type {import('axios').RawAxiosHeaders} */
      let headers = {
        ...formData.getHeaders(),
      };

      if (process.env.IMAGE_GEN_OAI_AZURE_API_VERSION && process.env.IMAGE_GEN_OAI_BASEURL) {
        headers['api-key'] = apiKey;
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      /** @type {AbortSignal} */
      let derivedSignal = null;
      /** @type {() => void} */
      let abortHandler = null;

      try {
        if (runnableConfig?.signal) {
          derivedSignal = AbortSignal.any([runnableConfig.signal]);
          abortHandler = createAbortHandler();
          derivedSignal.addEventListener('abort', abortHandler, { once: true });
        }

        /** @type {import('axios').AxiosRequestConfig} */
        const axiosConfig = {
          headers,
          ...clientConfig,
          signal: derivedSignal,
          baseURL,
        };

        applyAxiosProxyConfig(axiosConfig, baseURL);

        if (process.env.IMAGE_GEN_OAI_AZURE_API_VERSION && process.env.IMAGE_GEN_OAI_BASEURL) {
          axiosConfig.params = {
            'api-version': process.env.IMAGE_GEN_OAI_AZURE_API_VERSION,
            ...axiosConfig.params,
          };
        }
        const response = await axios.post('/images/edits', formData, axiosConfig);

        if (!response.data || !response.data.data || !response.data.data.length) {
          return returnValue(
            'No image data returned from OpenAI API. There may be a problem with the API or your configuration.',
          );
        }

        const imageURL = resolveImageURL(response.data.data[0], imageOutputType);
        if (!imageURL) {
          return returnValue(
            'No image data returned from the image API. There may be a problem with the provider or your configuration.',
          );
        }

        const content = [
          {
            type: ContentTypes.IMAGE_URL,
            image_url: {
              url: imageURL,
            },
          },
        ];

        const file_ids = [v4()];
        const textResponse = [
          {
            type: ContentTypes.TEXT,
            text:
              displayMessage +
              `\n\ngenerated_image_id: "${file_ids[0]}"\nreferenced_image_ids: ["${image_ids.join('", "')}"]`,
          },
        ];
        return [textResponse, { content, file_ids }];
      } catch (error) {
        const message = '[image_edit_oai] Problem editing the image:';
        logAxiosError({ error, message });
        return returnValue(`Something went wrong when trying to edit the image. The image API may be unavailable:
Error Message: ${error.message || 'Unknown error'}`);
      } finally {
        if (abortHandler && derivedSignal) {
          derivedSignal.removeEventListener('abort', abortHandler);
        }
      }
    },
    addModelSelection(oaiToolkit.image_edit_oai, imageEditModels, imageEditModel),
  );

  return [imageGenTool, imageEditTool];
}

module.exports = createOpenAIImageTools;
