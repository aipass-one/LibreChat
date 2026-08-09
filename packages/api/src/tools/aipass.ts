import { AuthType } from 'librechat-data-provider';
import { fetchModels } from '~/endpoints/models';
import type { FetchModelsParams } from '~/endpoints/models';

export const AIPASS_API_BASE_URL = 'https://aipass.one/v1';
export const AIPASS_DEFAULT_IMAGE_GENERATION_MODEL = 'nano-banana-2';
export const AIPASS_DEFAULT_IMAGE_EDIT_MODEL = 'nano-banana-2-edit';

type GetAIPassToken = (params: { userId: string }) => Promise<string | null>;
type FetchAIPassModels = (params: FetchModelsParams) => Promise<string[]>;

export interface ResolveAIPassImageToolParams {
  configuredApiKey: string;
  configuredBaseURL?: string;
  userId: string;
  getAIPassToken: GetAIPassToken;
  fetchAIPassModels?: FetchAIPassModels;
}

export interface AIPassImageToolAuth {
  apiKey: string;
  baseURL?: string;
  usesAIPassOAuth: boolean;
  generationModels: string[];
  editModels: string[];
}

/**
 * Resolves the AI Pass marker to the signed-in user's OAuth access token and
 * discovers the image models that account can currently use.
 *
 * The token is used only as a Bearer credential. AI Pass OAuth intentionally
 * does not require a compatibility client-id header.
 */
export async function resolveAIPassImageToolAuth({
  configuredApiKey,
  configuredBaseURL,
  userId,
  getAIPassToken,
  fetchAIPassModels = fetchModels,
}: ResolveAIPassImageToolParams): Promise<AIPassImageToolAuth> {
  if (configuredApiKey !== AuthType.AIPASS_OAUTH) {
    return {
      apiKey: configuredApiKey,
      baseURL: configuredBaseURL,
      usesAIPassOAuth: false,
      generationModels: [],
      editModels: [],
    };
  }

  const apiKey = await getAIPassToken({ userId });
  if (!apiKey) {
    throw new Error('AI Pass authentication required. Please sign in with AI Pass.');
  }

  const baseURL = configuredBaseURL || AIPASS_API_BASE_URL;
  const commonFetchOptions = {
    user: userId,
    apiKey,
    baseURL,
    name: 'AIPass',
    createTokenConfig: false,
  } satisfies Omit<FetchModelsParams, 'queryParams'>;

  const [generationModels, editModels] = await Promise.all([
    fetchAIPassModels({
      ...commonFetchOptions,
      queryParams: { type: 'image', method: 'image_generation' },
    }),
    fetchAIPassModels({
      ...commonFetchOptions,
      queryParams: { type: 'image', method: 'image_edit' },
    }),
  ]);

  return {
    apiKey,
    baseURL,
    usesAIPassOAuth: true,
    generationModels,
    editModels,
  };
}
