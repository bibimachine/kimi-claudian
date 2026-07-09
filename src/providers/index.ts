import { ProviderRegistry } from '../core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '../core/providers/ProviderWorkspaceRegistry';
import { kimiWorkspaceRegistration } from './kimi/app/KimiWorkspaceServices';
import { kimiProviderRegistration } from './kimi/registration';

let builtInProvidersRegistered = false;

export function registerBuiltInProviders(): void {
  if (builtInProvidersRegistered) {
    return;
  }

  ProviderRegistry.register('kimi', kimiProviderRegistration);
  ProviderWorkspaceRegistry.register('kimi', kimiWorkspaceRegistration);
  builtInProvidersRegistered = true;
}

registerBuiltInProviders();
