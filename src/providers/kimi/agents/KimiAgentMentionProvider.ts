import type { AgentMentionProvider } from '../../../core/providers/types';
import type { KimiAgentStorage } from '../storage/KimiAgentStorage';
import type { KimiAgentDefinition } from '../types/agent';

export class KimiAgentMentionProvider implements AgentMentionProvider {
  private agents: KimiAgentDefinition[] = [];

  constructor(private storage: KimiAgentStorage) {}

  async loadAgents(): Promise<void> {
    this.agents = await this.storage.loadAll();
  }

  searchAgents(query: string): Array<{
    id: string;
    name: string;
    description?: string;
    source: 'plugin' | 'vault' | 'global' | 'builtin';
  }> {
    const q = query.toLowerCase();
    return this.agents
      .filter((agent) => isMentionableSubagent(agent))
      .filter((agent) => (
        agent.name.toLowerCase().includes(q) ||
        agent.description.toLowerCase().includes(q)
      ))
      .map((agent) => ({
        id: agent.name,
        name: agent.name,
        description: agent.description,
        source: 'vault' as const,
      }));
  }
}

function isMentionableSubagent(agent: KimiAgentDefinition): boolean {
  if (agent.hidden || agent.disable) {
    return false;
  }

  return agent.mode === 'subagent';
}
