export interface KimiProviderState {
  sessionFile?: string;
}

export function getKimiState(
  providerState?: Record<string, unknown>,
): KimiProviderState {
  return (providerState ?? {});
}
