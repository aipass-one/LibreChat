import { useMemo } from 'react';
import { getNativeWebSearchConfig } from 'librechat-data-provider';
import { useGetEndpointsQuery } from '~/data-provider';
import { useChatContext } from '~/Providers/ChatContext';

export default function useNativeWebSearch() {
  const { conversation } = useChatContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const endpoint = conversation?.endpoint ?? '';
  const model = conversation?.model;

  return useMemo(() => {
    const nativeWebSearch = endpointsConfig?.[endpoint]?.customParams?.nativeWebSearch;
    const config = getNativeWebSearchConfig(endpointsConfig?.[endpoint]?.customParams, model);

    return {
      isManaged: nativeWebSearch != null,
      isAvailable: config != null,
      pricePerQuery: config?.pricePerQuery,
    };
  }, [endpoint, endpointsConfig, model]);
}
