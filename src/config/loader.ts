import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CodexCmuxConfig } from './types.js';
import { DEFAULT_CONFIG } from './defaults.js';

const CONFIG_FILE = join(homedir(), '.codex-cmux', 'config.json');
const CACHE_FILE = '/tmp/codex-cmux/config.cache.json';

function deepMerge(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const defaultVal = defaults[key];
    const overrideVal = overrides[key];
    if (
      defaultVal !== null && defaultVal !== undefined &&
      typeof defaultVal === 'object' && !Array.isArray(defaultVal) &&
      overrideVal !== null && overrideVal !== undefined &&
      typeof overrideVal === 'object' && !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(defaultVal as Record<string, unknown>, overrideVal as Record<string, unknown>);
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }
  return result;
}

function tryReadJson(filePath: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return null;
  } catch { return null; }
}

function writeCache(config: CodexCmuxConfig): void {
  try {
    mkdirSync('/tmp/codex-cmux', { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(config), 'utf-8');
  } catch {}
}

export function loadConfig(): CodexCmuxConfig {
  const cached = tryReadJson(CACHE_FILE);
  if (cached) {
    let cacheValid = true;
    try {
      const cacheMtime = statSync(CACHE_FILE).mtimeMs;
      const configMtime = statSync(CONFIG_FILE).mtimeMs;
      if (configMtime > cacheMtime) cacheValid = false;
    } catch {}
    if (cacheValid) {
      // Forward-compat: merge over defaults so new keys appear with older cache
      return deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, cached) as unknown as CodexCmuxConfig;
    }
  }

  const userConfig = tryReadJson(CONFIG_FILE);
  if (userConfig) {
    const merged = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, userConfig) as unknown as CodexCmuxConfig;
    writeCache(merged);
    return merged;
  }

  return DEFAULT_CONFIG;
}
