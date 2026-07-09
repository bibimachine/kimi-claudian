import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import type { ProviderSettingsReconciler } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { parseEnvironmentVariables } from '../../../utils/env';
import { clearKimiDiscoveryState } from '../discoveryState';
import { sameStringList, sameStringMap } from '../internal/compareCollections';
import { ensureProviderProjectionMap } from '../internal/providerProjection';
import {
  decodeKimiModelId,
  encodeKimiModelId,
  extractKimiModelVariantValue,
  isKimiModelSelectionId,
  KIMI_DEFAULT_THINKING_LEVEL,
  resolveKimiBaseModelRawId,
} from '../models';
import {
  getKimiProviderSettings,
  hasLegacyKimiDiscoveryFields,
  normalizeKimiPreferredThinkingByModel,
  normalizeKimiVisibleModels,
  updateKimiProviderSettings,
} from '../settings';


interface NormalizedSelection {
  baseModelId: string | null;
  variant: string | null;
}

const KIMI_ENV_HASH_KEYS = [
  'KIMI_CONFIG',
  'KIMI_DB',
  'KIMI_DISABLE_PROJECT_CONFIG',
  'XDG_DATA_HOME',
] as const;

function computeKimiEnvHash(envText: string): string {
  const envVars = parseEnvironmentVariables(envText || '');
  return KIMI_ENV_HASH_KEYS
    .filter((key) => envVars[key])
    .map((key) => `${key}=${envVars[key]}`)
    .sort()
    .join('|');
}

export const kimiSettingsReconciler: ProviderSettingsReconciler = {
  handleEnvironmentChange(settings: Record<string, unknown>): boolean {
    return clearKimiDiscoveryState(settings);
  },

  reconcileModelWithEnvironment(
    settings: Record<string, unknown>,
    conversations: Conversation[],
  ): { changed: boolean; invalidatedConversations: Conversation[] } {
    const envText = getRuntimeEnvironmentText(settings, 'kimi');
    const currentHash = computeKimiEnvHash(envText);
    const savedHash = getKimiProviderSettings(settings).environmentHash;

    if (currentHash === savedHash) {
      return { changed: false, invalidatedConversations: [] };
    }

    const invalidatedConversations: Conversation[] = [];
    for (const conversation of conversations) {
      if (conversation.providerId !== 'kimi') {
        continue;
      }

      if (!conversation.sessionId) {
        continue;
      }

      conversation.sessionId = null;
      conversation.providerState = undefined;
      invalidatedConversations.push(conversation);
    }

    updateKimiProviderSettings(settings, { environmentHash: currentHash });
    return { changed: true, invalidatedConversations };
  },

  normalizeModelVariantSettings(settings: Record<string, unknown>): boolean {
    const hadLegacyDiscoveryFields = hasLegacyKimiDiscoveryFields(settings);
    if (hadLegacyDiscoveryFields) {
      updateKimiProviderSettings(settings, {});
    }

    const kimiSettings = getKimiProviderSettings(settings);
    let changed = hadLegacyDiscoveryFields;

    const normalizeSelection = (value: unknown): NormalizedSelection => {
      if (typeof value !== 'string' || !isKimiModelSelectionId(value)) {
        return { baseModelId: null, variant: null };
      }

      const rawModelId = decodeKimiModelId(value);
      if (!rawModelId) {
        return { baseModelId: value, variant: null };
      }

      const baseRawId = resolveKimiBaseModelRawId(rawModelId, kimiSettings.discoveredModels);
      return {
        baseModelId: encodeKimiModelId(baseRawId),
        variant: extractKimiModelVariantValue(rawModelId, kimiSettings.discoveredModels),
      };
    };

    const modelSelection = normalizeSelection(settings.model);
    if (typeof settings.model === 'string' && modelSelection.baseModelId && settings.model !== modelSelection.baseModelId) {
      settings.model = modelSelection.baseModelId;
      changed = true;
    }
    if (
      modelSelection.variant
      && (typeof settings.effortLevel !== 'string' || settings.effortLevel.trim().length === 0)
    ) {
      settings.effortLevel = modelSelection.variant;
      changed = true;
    }

    const titleModelSelection = normalizeSelection(settings.titleGenerationModel);
    if (
      typeof settings.titleGenerationModel === 'string'
      && titleModelSelection.baseModelId
      && settings.titleGenerationModel !== titleModelSelection.baseModelId
    ) {
      settings.titleGenerationModel = titleModelSelection.baseModelId;
      changed = true;
    }

    const savedProviderModelRaw = settings.savedProviderModel;
    if (savedProviderModelRaw && typeof savedProviderModelRaw === 'object' && !Array.isArray(savedProviderModelRaw)) {
      const savedProviderModel = savedProviderModelRaw as Record<string, unknown>;
      const savedSelection = normalizeSelection(savedProviderModel.kimi);
      if (
        typeof savedProviderModel.kimi === 'string'
        && savedSelection.baseModelId
        && savedProviderModel.kimi !== savedSelection.baseModelId
      ) {
        savedProviderModel.kimi = savedSelection.baseModelId;
        changed = true;
      }
      if (savedSelection.variant) {
        const savedEffort = ensureProviderProjectionMap(settings, 'savedProviderEffort');
        if (typeof savedEffort.kimi !== 'string') {
          savedEffort.kimi = savedSelection.variant;
          changed = true;
        }
      }
    }

    const normalizedVisibleModels = normalizeKimiVisibleModels(
      kimiSettings.visibleModels,
      kimiSettings.discoveredModels,
    );
    const normalizedPreferredThinking = normalizeKimiPreferredThinkingByModel(
      kimiSettings.preferredThinkingByModel,
      kimiSettings.discoveredModels,
    );
    const shouldUpdateProviderSettings = !sameStringList(normalizedVisibleModels, kimiSettings.visibleModels)
      || !sameStringMap(normalizedPreferredThinking, kimiSettings.preferredThinkingByModel);
    if (shouldUpdateProviderSettings) {
      updateKimiProviderSettings(settings, {
        preferredThinkingByModel: normalizedPreferredThinking,
        visibleModels: normalizedVisibleModels,
      });
      changed = true;
    }

    if (typeof settings.effortLevel === 'string' && !settings.effortLevel.trim()) {
      settings.effortLevel = KIMI_DEFAULT_THINKING_LEVEL;
      changed = true;
    }

    return changed;
  },
};
