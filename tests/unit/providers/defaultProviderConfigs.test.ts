import { getBuiltInProviderDefaultConfigs } from '@/providers/defaultProviderConfigs';

describe('getBuiltInProviderDefaultConfigs', () => {
  it('returns fresh built-in provider config objects', () => {
    const first = getBuiltInProviderDefaultConfigs();
    const second = getBuiltInProviderDefaultConfigs();

    expect(first).toHaveProperty('kimi');
    expect(first).not.toHaveProperty('claude');
    expect(first).not.toHaveProperty('codex');
    expect(first).not.toHaveProperty('opencode');
    expect(first).not.toHaveProperty('pi');
    expect(first).not.toBe(second);
    expect(first.kimi).not.toBe(second.kimi);
  });
});
