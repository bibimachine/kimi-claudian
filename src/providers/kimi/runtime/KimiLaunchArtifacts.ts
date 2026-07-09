import * as path from 'node:path';

import { computeSystemPromptKey, type SystemPromptSettings } from '../../../core/prompt/mainAgent';
import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import { expandHomePath } from '../../../utils/path';

export interface KimiLaunchArtifacts {
  configPath: string | null;
  launchKey: string;
  systemPromptPath: string | null;
}

export interface PrepareKimiLaunchArtifactsParams {
  runtimeEnv: NodeJS.ProcessEnv;
  settings?: SystemPromptSettings;
  systemPromptText?: string;
  systemPromptKey?: string;
  workspaceRoot: string;
}

export async function prepareKimiLaunchArtifacts(
  params: PrepareKimiLaunchArtifactsParams,
): Promise<KimiLaunchArtifacts> {
  const promptKey = params.systemPromptKey
    ?? (params.systemPromptText !== undefined
      ? params.systemPromptText
      : computeSystemPromptKey(requireSettings(params)));

  const configPath = typeof params.runtimeEnv.KIMI_CONFIG === 'string'
    ? (path.isAbsolute(params.runtimeEnv.KIMI_CONFIG)
      ? params.runtimeEnv.KIMI_CONFIG
      : path.resolve(params.workspaceRoot, expandHomePath(params.runtimeEnv.KIMI_CONFIG)))
    : null;

  return {
    configPath,
    launchKey: [
      promptKey,
      configPath ?? '',
      getRuntimeEnvironmentText(params.settings as Record<string, unknown>, 'kimi'),
    ].join('::'),
    systemPromptPath: null,
  };
}

function requireSettings(
  params: PrepareKimiLaunchArtifactsParams,
): SystemPromptSettings {
  if (params.settings) {
    return params.settings;
  }

  throw new Error('prepareKimiLaunchArtifacts requires settings when no systemPromptText is provided');
}
