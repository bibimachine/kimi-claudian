import {
  decodeKimiModelId,
  encodeKimiModelId,
  isKimiModelSelectionId,
  KIMI_DEFAULT_THINKING_LEVEL,
  KIMI_SYNTHETIC_MODEL_ID,
} from '@/providers/kimi/models';

describe('Kimi model selection helpers', () => {
  it('detects kimi-prefixed model ids', () => {
    expect(isKimiModelSelectionId('kimi:kimi-code/kimi-for-coding')).toBe(true);
    expect(isKimiModelSelectionId(KIMI_SYNTHETIC_MODEL_ID)).toBe(true);
    expect(isKimiModelSelectionId('claude-code/sonnet')).toBe(false);
  });

  it('encodes raw model ids with kimi prefix', () => {
    expect(encodeKimiModelId('kimi-code/kimi-for-coding')).toBe('kimi:kimi-code/kimi-for-coding');
  });

  it('returns synthetic id for empty raw model', () => {
    expect(encodeKimiModelId('')).toBe(KIMI_SYNTHETIC_MODEL_ID);
  });

  it('decodes kimi-prefixed ids', () => {
    expect(decodeKimiModelId('kimi:kimi-code/kimi-for-coding')).toBe('kimi-code/kimi-for-coding');
  });

  it('returns null for non-kimi ids', () => {
    expect(decodeKimiModelId('kimi-code/kimi-for-coding')).toBeNull();
  });

  it('has a default thinking level', () => {
    expect(KIMI_DEFAULT_THINKING_LEVEL).toBe('default');
  });
});
