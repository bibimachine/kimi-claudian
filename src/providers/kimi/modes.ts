export interface KimiMode {
  description?: string;
  id: string;
  name: string;
}

export const KIMI_BUILD_MODE_ID = 'build';
export const KIMI_YOLO_MODE_ID = 'claudian-yolo';
export const KIMI_SAFE_MODE_ID = 'claudian-safe';
export const KIMI_PLAN_MODE_ID = 'plan';

export const KIMI_FALLBACK_MODES: ReadonlyArray<KimiMode> = Object.freeze([
  {
    description: 'The default agent. Executes tools based on configured permissions.',
    id: KIMI_YOLO_MODE_ID,
    name: 'yolo',
  },
  {
    description: 'Safe mode. Asks before shell commands and file edits.',
    id: KIMI_SAFE_MODE_ID,
    name: 'safe',
  },
  {
    description: 'Plan mode. Disallows all edit tools.',
    id: KIMI_PLAN_MODE_ID,
    name: KIMI_PLAN_MODE_ID,
  },
]);

const KIMI_MANAGED_MODE_IDS = new Set([
  KIMI_BUILD_MODE_ID,
  ...KIMI_FALLBACK_MODES.map((mode) => mode.id),
]);

export function normalizeKimiAvailableModes(value: unknown): KimiMode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: KimiMode[] = [];
  const seen = new Set<string>();
  for (const entry of value as unknown[]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;

    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : id;
    const description = typeof record.description === 'string'
      ? record.description.trim()
      : '';

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    normalized.push({
      ...(description ? { description } : {}),
      id,
      name: name || id,
    });
  }

  return normalized;
}

export function getEffectiveKimiModes(modes: KimiMode[]): KimiMode[] {
  return modes.length > 0 ? modes : [...KIMI_FALLBACK_MODES];
}

export function isManagedKimiModeId(value: string): boolean {
  return KIMI_MANAGED_MODE_IDS.has(value);
}

export function getManagedKimiModes(modes: KimiMode[]): KimiMode[] {
  const effectiveModes = getEffectiveKimiModes(modes);
  return KIMI_FALLBACK_MODES.map((fallbackMode) => (
    effectiveModes.find((mode) => mode.id === fallbackMode.id) ?? fallbackMode
  ));
}

export function normalizeKimiSelectedMode(
  value: unknown,
): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed;
}

export function normalizeManagedKimiSelectedMode(
  value: unknown,
  modes: KimiMode[] = [],
): string {
  const normalized = normalizeKimiSelectedMode(value);
  if (!normalized) {
    return '';
  }

  const canonicalModeId = normalized === KIMI_BUILD_MODE_ID
    ? KIMI_YOLO_MODE_ID
    : normalized;
  const managedModes = getManagedKimiModes(modes);
  return managedModes.some((mode) => mode.id === canonicalModeId)
    ? canonicalModeId
    : (managedModes[0]?.id ?? '');
}

export function resolveKimiModeForPermissionMode(
  permissionMode: unknown,
  modes: KimiMode[] = [],
): string {
  const managedModes = getManagedKimiModes(modes);
  const managedModeIds = new Set(managedModes.map((mode) => mode.id));

  if (permissionMode === 'plan' && managedModeIds.has(KIMI_PLAN_MODE_ID)) {
    return KIMI_PLAN_MODE_ID;
  }
  if (permissionMode === 'normal' && managedModeIds.has(KIMI_SAFE_MODE_ID)) {
    return KIMI_SAFE_MODE_ID;
  }
  if (managedModeIds.has(KIMI_YOLO_MODE_ID)) {
    return KIMI_YOLO_MODE_ID;
  }

  return managedModes[0]?.id ?? '';
}

export function resolvePermissionModeForManagedKimiMode(
  modeId: unknown,
): 'normal' | 'plan' | 'yolo' | null {
  if (modeId === KIMI_BUILD_MODE_ID || modeId === KIMI_YOLO_MODE_ID) {
    return 'yolo';
  }
  if (modeId === KIMI_SAFE_MODE_ID) {
    return 'normal';
  }
  if (modeId === KIMI_PLAN_MODE_ID) {
    return 'plan';
  }
  return null;
}
