import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type {
  ProviderTabWarmupPolicy,
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import type { VaultFileAdapter } from '../../../core/storage/VaultFileAdapter';
import { KimiAgentMentionProvider } from '../agents/KimiAgentMentionProvider';
import { KimiCommandCatalog } from '../commands/KimiCommandCatalog';
import { KimiCliResolver } from '../runtime/KimiCliResolver';
import { KimiAgentStorage } from '../storage/KimiAgentStorage';
import { kimiSettingsTabRenderer } from '../ui/KimiSettingsTab';
import { KimiRuntimeCommandLoader } from './KimiRuntimeCommandLoader';

export interface KimiWorkspaceServices extends ProviderWorkspaceServices {
  agentStorage: KimiAgentStorage;
  agentMentionProvider: KimiAgentMentionProvider;
  commandCatalog: ProviderCommandCatalog;
}

const kimiTabWarmupPolicy: ProviderTabWarmupPolicy = {
  resolveMode() {
    return 'commands';
  },
};

export async function createKimiWorkspaceServices(
  vaultAdapter: VaultFileAdapter,
): Promise<KimiWorkspaceServices> {
  const agentStorage = new KimiAgentStorage(vaultAdapter);
  const agentMentionProvider = new KimiAgentMentionProvider(agentStorage);
  await agentMentionProvider.loadAgents();

  return {
    agentStorage,
    agentMentionProvider,
    commandCatalog: new KimiCommandCatalog(),
    cliResolver: new KimiCliResolver(),
    runtimeCommandLoader: new KimiRuntimeCommandLoader(),
    settingsTabRenderer: kimiSettingsTabRenderer,
    tabWarmupPolicy: kimiTabWarmupPolicy,
    refreshAgentMentions: async () => {
      await agentMentionProvider.loadAgents();
    },
  };
}

export const kimiWorkspaceRegistration: ProviderWorkspaceRegistration<KimiWorkspaceServices> = {
  initialize: async ({ vaultAdapter }) => createKimiWorkspaceServices(vaultAdapter),
};

export function maybeGetKimiWorkspaceServices(): KimiWorkspaceServices | null {
  return ProviderWorkspaceRegistry.getServices('kimi') as KimiWorkspaceServices | null;
}
