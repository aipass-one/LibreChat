import React, { useMemo } from 'react';
import { TooltipAnchor } from '@librechat/client';
import { getConfigDefaults } from 'librechat-data-provider';
import type { ModelSelectorProps } from '~/common';
import {
  renderModelSpecs,
  renderEndpoints,
  renderSearchResults,
  renderCustomGroups,
  renderEndpointModels,
} from './components';
import { ModelSelectorProvider, useModelSelectorContext } from './ModelSelectorContext';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { ModelSelectorChatProvider } from './ModelSelectorChatContext';
import { filterModels, getDirectModelEndpoint, getSelectedIcon, getDisplayValue } from './utils';
import { CustomMenu as Menu } from './CustomMenu';
import DialogManager from './DialogManager';
import { useLocalize } from '~/hooks';

const defaultInterface = getConfigDefaults().interface;

function ModelSelectorContent() {
  const localize = useLocalize();
  const modelSelectorHint = useShortcutHint('openModelSelector', localize('com_ui_select_model'));
  const modelSelectorAriaKey = useShortcutAriaKey('openModelSelector');

  const {
    // LibreChat
    agentsMap,
    modelSpecs,
    mappedEndpoints,
    endpointsConfig,
    endpointRequiresUserKey,
    // State
    searchValue,
    searchResults,
    selectedValues,
    // Functions
    setSearchValue,
    setSelectedValues,
    // Dialog
    keyDialogOpen,
    onOpenChange,
    keyDialogEndpoint,
  } = useModelSelectorContext();

  const directModelEndpoint = useMemo(
    () => getDirectModelEndpoint(mappedEndpoints, modelSpecs, endpointRequiresUserKey),
    [mappedEndpoints, modelSpecs, endpointRequiresUserKey],
  );
  const directModels = useMemo(() => {
    if (!directModelEndpoint?.models) {
      return null;
    }

    const models = directModelEndpoint.models.map((model) => model.name);
    if (!searchValue) {
      return models;
    }

    return filterModels(directModelEndpoint, models, searchValue, agentsMap, undefined);
  }, [agentsMap, directModelEndpoint, searchValue]);

  const selectedIcon = useMemo(
    () =>
      getSelectedIcon({
        mappedEndpoints: mappedEndpoints ?? [],
        selectedValues,
        modelSpecs,
        endpointsConfig,
      }),
    [mappedEndpoints, selectedValues, modelSpecs, endpointsConfig],
  );
  const selectedDisplayValue = useMemo(
    () =>
      getDisplayValue({
        localize,
        agentsMap,
        modelSpecs,
        selectedValues,
        mappedEndpoints,
      }),
    [localize, agentsMap, modelSpecs, selectedValues, mappedEndpoints],
  );

  const trigger = (
    <TooltipAnchor
      aria-label={localize('com_ui_select_model')}
      description={modelSelectorHint}
      render={
        <button
          data-testid="model-selector-button"
          aria-keyshortcuts={modelSelectorAriaKey}
          className="my-1 flex h-9 w-full max-w-[70vw] items-center justify-center gap-2 rounded-xl border border-border-light bg-presentation px-3 py-2 text-sm text-text-primary hover:bg-surface-active-alt"
          aria-label={localize('com_ui_select_model')}
        >
          {selectedIcon && React.isValidElement(selectedIcon) && (
            <div className="flex flex-shrink-0 items-center justify-center overflow-hidden">
              {selectedIcon}
            </div>
          )}
          <span className="flex-grow truncate text-left">{selectedDisplayValue}</span>
        </button>
      }
    />
  );

  let menuContent: React.ReactNode;
  if (directModelEndpoint && directModels) {
    menuContent =
      directModels.length > 0 ? (
        renderEndpointModels(directModelEndpoint, directModelEndpoint.models ?? [], directModels, 0)
      ) : (
        <div role="alert" aria-live="polite" className="cursor-default p-2 sm:py-1 sm:text-sm">
          {localize('com_files_no_results')}
        </div>
      );
  } else if (searchResults) {
    menuContent = renderSearchResults(searchResults, localize, searchValue);
  } else {
    menuContent = (
      <>
        {renderModelSpecs(
          modelSpecs?.filter((spec) => !spec.group) || [],
          selectedValues.modelSpec || '',
        )}
        {renderEndpoints(mappedEndpoints ?? [])}
        {renderCustomGroups(modelSpecs || [], mappedEndpoints ?? [])}
      </>
    );
  }

  return (
    <div className="relative flex w-full max-w-md flex-col items-center gap-2">
      <Menu
        values={selectedValues}
        onValuesChange={(values: Record<string, any>) => {
          setSelectedValues({
            endpoint: values.endpoint || '',
            model: values.model || '',
            modelSpec: values.modelSpec || '',
          });
        }}
        onSearch={(value) => setSearchValue(value)}
        combobox={<input id="model-search" placeholder=" " />}
        comboboxLabel={
          directModelEndpoint
            ? localize('com_endpoint_search_endpoint_models', { 0: directModelEndpoint.label })
            : localize('com_endpoint_search_models')
        }
        trigger={trigger}
      >
        {menuContent}
      </Menu>
      <DialogManager
        keyDialogOpen={keyDialogOpen}
        onOpenChange={onOpenChange}
        endpointsConfig={endpointsConfig || {}}
        keyDialogEndpoint={keyDialogEndpoint || undefined}
      />
    </div>
  );
}

export default function ModelSelector({ startupConfig }: ModelSelectorProps) {
  const interfaceConfig = startupConfig?.interface ?? defaultInterface;
  const modelSpecs = startupConfig?.modelSpecs?.list ?? [];

  // Hide the selector when modelSelect is false and there are no model specs to show
  if (interfaceConfig.modelSelect === false && modelSpecs.length === 0) {
    return null;
  }

  return (
    <ModelSelectorChatProvider>
      <ModelSelectorProvider startupConfig={startupConfig}>
        <ModelSelectorContent />
      </ModelSelectorProvider>
    </ModelSelectorChatProvider>
  );
}
