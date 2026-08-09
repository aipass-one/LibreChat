import type { useLocalize } from '~/hooks';
import type { Endpoint } from '~/common';
import { filterItems, getDirectModelEndpoint } from '../utils';

const agentsEndpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: true,
  icon: null,
  showMarketplace: true,
  searchAliases: ['agent marketplace', 'marketplace'],
};

const disabledAgentsEndpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: false,
  icon: null,
};

const aipassEndpoint: Endpoint = {
  value: 'AIPass',
  label: 'AIPass',
  hasModels: true,
  icon: null,
  models: [{ name: 'gpt-5.4-mini' }, { name: 'glm-5.2' }],
};

describe('model selector utilities', () => {
  it('matches endpoint search aliases', () => {
    const results = filterItems([agentsEndpoint], 'marketplace', undefined, undefined);
    expect(results).toEqual([agentsEndpoint]);
  });

  it('matches localized Marketplace labels', () => {
    const localize = ((key: string) => {
      if (key === 'com_agents_marketplace') {
        return 'Tienda de Agentes';
      }
      if (key === 'com_ui_marketplace') {
        return 'Tienda';
      }
      return key;
    }) as ReturnType<typeof useLocalize>;

    const results = filterItems([agentsEndpoint], 'tienda', undefined, undefined, localize);
    expect(results).toEqual([agentsEndpoint]);
  });

  it('does not match agents when there are no selectable agent options', () => {
    const results = filterItems([disabledAgentsEndpoint], 'my agents', undefined, undefined);
    expect(results).toEqual([]);
  });

  it('shows models directly when there is one configured endpoint', () => {
    const endpoint = getDirectModelEndpoint([aipassEndpoint], [], () => false);

    expect(endpoint).toBe(aipassEndpoint);
  });

  it('keeps endpoint grouping when another endpoint is available', () => {
    const endpoint = getDirectModelEndpoint(
      [aipassEndpoint, { ...aipassEndpoint, value: 'other', label: 'Other' }],
      [],
      () => false,
    );

    expect(endpoint).toBeNull();
  });

  it('keeps endpoint grouping when model specs or endpoint settings are available', () => {
    const modelSpecEndpoint = getDirectModelEndpoint(
      [aipassEndpoint],
      [{ name: 'fast', label: 'Fast', preset: { endpoint: 'AIPass', model: 'glm-5.2' } }],
      () => false,
    );
    const userKeyEndpoint = getDirectModelEndpoint([aipassEndpoint], [], () => true);

    expect(modelSpecEndpoint).toBeNull();
    expect(userKeyEndpoint).toBeNull();
  });
});
