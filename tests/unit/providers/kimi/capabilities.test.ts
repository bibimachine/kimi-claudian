import { KIMI_PROVIDER_CAPABILITIES } from '@/providers/kimi/capabilities';

describe('Kimi provider capabilities', () => {
  it('identifies as kimi', () => {
    expect(KIMI_PROVIDER_CAPABILITIES.providerId).toBe('kimi');
  });

  it('supports persistent runtime and native history', () => {
    expect(KIMI_PROVIDER_CAPABILITIES.supportsPersistentRuntime).toBe(true);
    expect(KIMI_PROVIDER_CAPABILITIES.supportsNativeHistory).toBe(true);
  });

  it('does not support rewind or fork', () => {
    expect(KIMI_PROVIDER_CAPABILITIES.supportsRewind).toBe(false);
    expect(KIMI_PROVIDER_CAPABILITIES.supportsFork).toBe(false);
  });

  it('uses effort-based reasoning control', () => {
    expect(KIMI_PROVIDER_CAPABILITIES.reasoningControl).toBe('effort');
  });
});
