import type { ProviderConfigMap } from '../core/types/settings';
import { DEFAULT_KIMI_PROVIDER_SETTINGS } from './kimi/settings';

export function getBuiltInProviderDefaultConfigs(): ProviderConfigMap {
  return {
    kimi: { ...DEFAULT_KIMI_PROVIDER_SETTINGS },
  };
}
