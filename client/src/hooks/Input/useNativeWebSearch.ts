import { useMemo } from 'react';
import { getDelegatedWebSearchConfig, getNativeWebSearchConfig } from 'librechat-data-provider';
import { useGetEndpointsQuery } from '~/data-provider';
import { useChatContext } from '~/Providers/ChatContext';

export default function useNativeWebSearch() {
  const { conversation } = useChatContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const endpoint = conversation?.endpoint ?? '';
  const model = conversation?.model;

  return useMemo(() => {
    const nativeWebSearch = endpointsConfig?.[endpoint]?.customParams?.nativeWebSearch;
    const nativeConfig = getNativeWebSearchConfig(endpointsConfig?.[endpoint]?.customParams, model);
    const delegatedConfig = getDelegatedWebSearchConfig(
      endpointsConfig?.[endpoint]?.customParams,
      model,
    );
    const config = nativeConfig ?? delegatedConfig;

    return {
      isManaged: nativeWebSearch != null,
      isAvailable: config != null,
      isNative: nativeConfig != null,
      pricePerQuery: config?.pricePerQuery,
      searchModel: delegatedConfig?.searchModel,
    };
  }, [endpoint, endpointsConfig, model]);
}
