import type {
  ProviderChatUIConfig,
  ProviderPermissionModeToggleConfig,
  ProviderReasoningOption,
  ProviderUIOption,
} from '../../../core/providers/types';
import { KIMI_PROVIDER_ICON } from '../../../shared/icons';
import {
  buildKimiBaseModels,
  decodeKimiModelId,
  encodeKimiModelId,
  isKimiModelSelectionId,
  KIMI_DEFAULT_THINKING_LEVEL,
  KIMI_SYNTHETIC_MODEL_ID,
  resolveKimiBaseModelRawId,
} from '../models';
import {
  resolveKimiModeForPermissionMode,
  resolvePermissionModeForManagedKimiMode,
} from '../modes';
import { KimiChatRuntime } from '../runtime/KimiChatRuntime';
import { getKimiProviderSettings, updateKimiProviderSettings } from '../settings';

const KIMI_MODELS: ProviderUIOption[] = [
  { value: KIMI_SYNTHETIC_MODEL_ID, label: 'Kimi Code CLI', description: 'ACP runtime' },
];
const DEFAULT_CONTEXT_WINDOW = 200_000;
const KIMI_METADATA_WARMUP_DB = ':memory:';
const KIMI_PERMISSION_MODE_TOGGLE: ProviderPermissionModeToggleConfig = {
  inactiveValue: 'normal',
  inactiveLabel: 'Safe',
  activeValue: 'yolo',
  activeLabel: 'YOLO',
  planValue: 'plan',
  planLabel: 'Plan',
};

export const kimiChatUIConfig: ProviderChatUIConfig = {
  getModelOptions(settings): ProviderUIOption[] {
    const kimiSettings = getKimiProviderSettings(settings);
    const applyAlias = (rawId: string, option: ProviderUIOption): ProviderUIOption => {
      const alias = kimiSettings.modelAliases[rawId];
      return alias ? { ...option, label: alias } : option;
    };
    const discoveredModels = new Map(buildKimiBaseModels(kimiSettings.discoveredModels).map((model) => [
      encodeKimiModelId(model.rawId),
      applyAlias(model.rawId, {
        description: model.description ?? 'ACP runtime',
        label: model.label,
        value: encodeKimiModelId(model.rawId),
      }),
    ]));
    const savedProviderModel = (
      settings.savedProviderModel
      && typeof settings.savedProviderModel === 'object'
      && !Array.isArray(settings.savedProviderModel)
    )
      ? settings.savedProviderModel as Record<string, unknown>
      : null;

    const seenValues = new Set<string>();
    const options: ProviderUIOption[] = [];
    for (const rawModelId of kimiSettings.visibleModels) {
      const encodedModelId = encodeKimiModelId(rawModelId);
      pushOption(
        options,
        seenValues,
        encodedModelId,
        discoveredModels.get(encodedModelId)
          ?? applyAlias(rawModelId, {
            description: 'Configured model',
            label: rawModelId,
            value: encodedModelId,
          }),
      );
    }

    const selectedModelValues = [
      typeof settings.model === 'string' ? settings.model : '',
      typeof savedProviderModel?.kimi === 'string'
        ? savedProviderModel.kimi
        : '',
    ];

    for (const model of selectedModelValues) {
      const rawModelId = decodeKimiModelId(model);
      if (
        !model
        || !isKimiModelSelectionId(model)
        || model === KIMI_SYNTHETIC_MODEL_ID
        || !rawModelId
      ) {
        continue;
      }

      const baseRawId = resolveKimiBaseModelRawId(rawModelId, kimiSettings.discoveredModels);
      const baseModelId = encodeKimiModelId(baseRawId);
      pushOption(
        options,
        seenValues,
        baseModelId,
        discoveredModels.get(baseModelId)
          ?? applyAlias(baseRawId, {
            description: 'Selected in an existing session',
            label: baseRawId,
            value: baseModelId,
          }),
      );
    }

    return options.length > 0 ? options : [...KIMI_MODELS];
  },

  ownsModel(model: string): boolean {
    return isKimiModelSelectionId(model);
  },

  isAdaptiveReasoningModel(model: string, settings: Record<string, unknown>): boolean {
    return getKimiThinkingOptions(model, settings).length > 0;
  },

  getReasoningOptions(model: string, settings: Record<string, unknown>): ProviderReasoningOption[] {
    return getKimiThinkingOptions(model, settings)
      .map((variant) => ({
        description: variant.description,
        label: variant.label,
        value: variant.value,
      }));
  },

  getDefaultReasoningValue(model: string, settings: Record<string, unknown>): string {
    const rawModelId = decodeKimiModelId(model);
    if (!rawModelId) {
      return KIMI_DEFAULT_THINKING_LEVEL;
    }

    const kimiSettings = getKimiProviderSettings(settings);
    const baseRawId = resolveKimiBaseModelRawId(rawModelId, kimiSettings.discoveredModels);
    return getDefaultThinkingLevelForModel(baseRawId, settings);
  },

  getContextWindowSize(model: string, customLimits?: Record<string, number>): number {
    return customLimits?.[model] ?? DEFAULT_CONTEXT_WINDOW;
  },

  isDefaultModel(model: string): boolean {
    return isKimiModelSelectionId(model);
  },

  applyModelDefaults(model: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return;
    }

    const settingsBag = settings as Record<string, unknown>;
    const rawModelId = decodeKimiModelId(model);
    if (!rawModelId) {
      settingsBag.effortLevel = KIMI_DEFAULT_THINKING_LEVEL;
      return;
    }

    const kimiSettings = getKimiProviderSettings(settingsBag);
    const baseRawId = resolveKimiBaseModelRawId(rawModelId, kimiSettings.discoveredModels);
    settingsBag.model = encodeKimiModelId(baseRawId);
    settingsBag.effortLevel = getDefaultThinkingLevelForModel(baseRawId, settingsBag);
  },

  async prepareModelMetadata(model: string, _settings: Record<string, unknown>, context): Promise<void> {
    const rawModelId = decodeKimiModelId(model);
    if (!rawModelId) {
      return;
    }

    const kimiSettings = getKimiProviderSettings(context.plugin.settings);
    const baseRawId = resolveKimiBaseModelRawId(rawModelId, kimiSettings.discoveredModels);
    if (baseRawId && kimiSettings.thinkingOptionsByModel[baseRawId]) {
      return;
    }

    const runtime = new KimiChatRuntime(context.plugin);
    try {
      runtime.syncConversationState({
        providerState: { databasePath: KIMI_METADATA_WARMUP_DB },
        sessionId: null,
      });
      await runtime.warmModelMetadata(model);
    } catch {
      // Metadata warmup is opportunistic; the first real turn can still discover it.
    } finally {
      runtime.cleanup();
    }
  },

  applyReasoningSelection(model: string, value: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return;
    }

    const settingsBag = settings as Record<string, unknown>;
    const rawModelId = decodeKimiModelId(model);
    if (!rawModelId) {
      return;
    }

    const kimiSettings = getKimiProviderSettings(settingsBag);
    const baseRawId = resolveKimiBaseModelRawId(rawModelId, kimiSettings.discoveredModels);
    const supportedValues = new Set(
      (kimiSettings.thinkingOptionsByModel[baseRawId] ?? []).map((variant) => variant.value),
    );
    const nextPreferredThinkingByModel = {
      ...kimiSettings.preferredThinkingByModel,
    };

    if (!value || value === KIMI_DEFAULT_THINKING_LEVEL || !supportedValues.has(value)) {
      delete nextPreferredThinkingByModel[baseRawId];
    } else {
      nextPreferredThinkingByModel[baseRawId] = value;
    }

    updateKimiProviderSettings(settingsBag, {
      preferredThinkingByModel: nextPreferredThinkingByModel,
    });
  },

  normalizeModelVariant(model: string, settings: Record<string, unknown>): string {
    const rawModelId = decodeKimiModelId(model);
    if (!rawModelId) {
      return model;
    }

    const kimiSettings = getKimiProviderSettings(settings);
    const baseRawId = resolveKimiBaseModelRawId(rawModelId, kimiSettings.discoveredModels);
    return encodeKimiModelId(baseRawId);
  },

  getCustomModelIds(): Set<string> {
    return new Set<string>();
  },

  getModeSelector(): null {
    return null;
  },

  getPermissionModeToggle(): ProviderPermissionModeToggleConfig {
    return KIMI_PERMISSION_MODE_TOGGLE;
  },

  resolvePermissionMode(settings: Record<string, unknown>): string | null {
    const selectedMode = getKimiProviderSettings(settings).selectedMode;
    return resolvePermissionModeForManagedKimiMode(selectedMode);
  },

  applyPermissionMode(value: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return;
    }

    const settingsBag = settings as Record<string, unknown>;
    settingsBag.permissionMode = value;
    updateKimiProviderSettings(settingsBag, {
      selectedMode: resolveKimiModeForPermissionMode(
        value,
        getKimiProviderSettings(settingsBag).availableModes,
      ),
    });
  },

  getProviderIcon() {
    return KIMI_PROVIDER_ICON;
  },
};

function getDefaultThinkingLevelForModel(
  baseRawId: string,
  settings: Record<string, unknown>,
): string {
  const kimiSettings = getKimiProviderSettings(settings);
  const preferred = kimiSettings.preferredThinkingByModel[baseRawId];
  const supportedValues = new Set(
    (kimiSettings.thinkingOptionsByModel[baseRawId] ?? []).map((variant) => variant.value),
  );
  if (preferred && supportedValues.has(preferred)) {
    return preferred;
  }

  return kimiSettings.thinkingOptionsByModel[baseRawId]?.[0]?.value
    ?? KIMI_DEFAULT_THINKING_LEVEL;
}

function getKimiThinkingOptions(
  model: string,
  settings: Record<string, unknown>,
): ProviderReasoningOption[] {
  const rawModelId = decodeKimiModelId(model);
  if (!rawModelId) {
    return [];
  }

  const kimiSettings = getKimiProviderSettings(settings);
  const baseRawId = resolveKimiBaseModelRawId(rawModelId, kimiSettings.discoveredModels);
  return kimiSettings.thinkingOptionsByModel[baseRawId] ?? [];
}

function pushOption(
  target: ProviderUIOption[],
  seenValues: Set<string>,
  value: string,
  option: ProviderUIOption,
): void {
  if (seenValues.has(value)) {
    return;
  }

  seenValues.add(value);
  target.push(option);
}
