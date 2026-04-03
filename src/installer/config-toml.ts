/**
 * Safe TOML editor for enabling codex_hooks in config.toml.
 * Line-based editing — never full rewrite, never corrupt existing content.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function ensureHooksEnabled(configTomlPath: string): { alreadyEnabled: boolean; modified: boolean } {
  // Create directory if needed
  mkdirSync(dirname(configTomlPath), { recursive: true });

  if (!existsSync(configTomlPath)) {
    writeFileSync(configTomlPath, '[features]\ncodex_hooks = true\n', 'utf-8');
    return { alreadyEnabled: false, modified: true };
  }

  const content = readFileSync(configTomlPath, 'utf-8');

  // Already enabled
  if (/codex_hooks\s*=\s*true/i.test(content)) {
    return { alreadyEnabled: true, modified: false };
  }

  // Has the key but set to false — flip it
  if (/codex_hooks\s*=\s*false/i.test(content)) {
    const updated = content.replace(/codex_hooks\s*=\s*false/i, 'codex_hooks = true');
    writeFileSync(configTomlPath, updated, 'utf-8');
    return { alreadyEnabled: false, modified: true };
  }

  // Has [features] section but no codex_hooks key
  if (/^\[features\]/m.test(content)) {
    const updated = content.replace(/^\[features\]/m, '[features]\ncodex_hooks = true');
    writeFileSync(configTomlPath, updated, 'utf-8');
    return { alreadyEnabled: false, modified: true };
  }

  // No [features] section at all — append
  const newContent = content.trimEnd() + '\n\n[features]\ncodex_hooks = true\n';
  writeFileSync(configTomlPath, newContent, 'utf-8');
  return { alreadyEnabled: false, modified: true };
}
