/**
 * Merge codex-cmux hooks into ~/.codex/hooks.json.
 * Identifies codex-cmux entries by command path containing 'codex-cmux'.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';

export interface MergeResult {
  merged: boolean;
  backup: string | null;
  added: string[];
  updated: string[];
  preserved: string[];
}

export function mergeHooksIntoFile(
  hooksJsonPath: string,
  newHooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout: number }> }>>,
): MergeResult {
  const result: MergeResult = { merged: false, backup: null, added: [], updated: [], preserved: [] };

  try {
    let existing: Record<string, unknown> = {};
    if (existsSync(hooksJsonPath)) {
      const backupPath = hooksJsonPath + '.codex-cmux-backup';
      copyFileSync(hooksJsonPath, backupPath);
      result.backup = backupPath;
      existing = JSON.parse(readFileSync(hooksJsonPath, 'utf-8'));
    }

    const existingHooks = (existing['hooks'] as Record<string, unknown[]>) || {};
    const mergedHooks: Record<string, unknown[]> = {};

    // Collect all event names
    const allEvents = new Set([...Object.keys(existingHooks), ...Object.keys(newHooks)]);

    for (const eventName of allEvents) {
      const existingEntries = (existingHooks[eventName] as Array<Record<string, unknown>>) || [];
      const newEntries = newHooks[eventName] || [];

      // Separate user entries from codex-cmux entries
      const userEntries = existingEntries.filter((e) => {
        const hooks = e['hooks'] as Array<Record<string, string>> | undefined;
        if (!hooks) return true;
        return !hooks.some((h) => typeof h['command'] === 'string' && h['command'].includes('codex-cmux'));
      });

      if (userEntries.length > 0 && newEntries.length === 0) {
        result.preserved.push(eventName);
      }

      if (newEntries.length > 0) {
        const hadExisting = existingEntries.some((e) => {
          const hooks = e['hooks'] as Array<Record<string, string>> | undefined;
          return hooks?.some((h) => typeof h['command'] === 'string' && h['command'].includes('codex-cmux'));
        });
        if (hadExisting) {
          result.updated.push(eventName);
        } else {
          result.added.push(eventName);
        }
      }

      // User entries first, then codex-cmux entries
      mergedHooks[eventName] = [...userEntries, ...newEntries];
    }

    existing['hooks'] = mergedHooks;
    writeFileSync(hooksJsonPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
    result.merged = true;
  } catch {
    result.merged = false;
  }

  return result;
}

export function removeCodexCmuxHooks(hooksJsonPath: string): { removed: string[] } {
  const removed: string[] = [];
  if (!existsSync(hooksJsonPath)) return { removed };

  try {
    const content = JSON.parse(readFileSync(hooksJsonPath, 'utf-8'));
    const hooks = content['hooks'] as Record<string, unknown[]> | undefined;
    if (!hooks) return { removed };

    for (const [eventName, entries] of Object.entries(hooks)) {
      if (!Array.isArray(entries)) continue;
      const filtered = entries.filter((e: Record<string, unknown>) => {
        const h = e['hooks'] as Array<Record<string, string>> | undefined;
        if (!h) return true;
        return !h.some((hook) => typeof hook['command'] === 'string' && hook['command'].includes('codex-cmux'));
      });
      if (filtered.length < entries.length) removed.push(eventName);
      if (filtered.length === 0) {
        delete hooks[eventName];
      } else {
        hooks[eventName] = filtered;
      }
    }

    writeFileSync(hooksJsonPath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
  } catch {}

  return { removed };
}
