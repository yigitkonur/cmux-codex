/**
 * Generate Codex hooks.json content.
 * Codex hooks format: no "description" field, uses "matcher" field.
 */

interface HookEntry {
  type: 'command';
  command: string;
  timeout: number;
}

interface HookEventConfig {
  matcher?: string;
  hooks: HookEntry[];
}

const FEATURE_EVENTS: Record<string, string[]> = {
  statusPills: ['SessionStart', 'UserPromptSubmit', 'Stop'],
  progress: ['PreToolUse', 'Stop'],
  logs: ['PostToolUse'],
  notifications: ['Stop'],
  gitIntegration: ['SessionStart'],
};

export function generateHooks(
  enabledFeatures: string[],
  handlerPath: string,
): Record<string, HookEventConfig[]> {
  const neededEvents = new Set<string>();
  for (const feature of enabledFeatures) {
    const events = FEATURE_EVENTS[feature];
    if (events) {
      for (const event of events) neededEvents.add(event);
    }
  }

  const hooks: Record<string, HookEventConfig[]> = {};
  const hookCmd: HookEntry = { type: 'command', command: `node ${handlerPath}`, timeout: 10 };

  for (const eventName of neededEvents) {
    const entry: HookEventConfig = { hooks: [hookCmd] };

    // Add matchers per Codex spec
    if (eventName === 'SessionStart') {
      entry.matcher = 'startup|resume';
    } else if (eventName === 'PreToolUse' || eventName === 'PostToolUse') {
      entry.matcher = 'Bash';
    }
    // UserPromptSubmit and Stop: matcher not supported, omit

    hooks[eventName] = [entry];
  }

  return hooks;
}

export function allCodexCmuxEvents(): string[] {
  const allEvents = new Set<string>();
  for (const events of Object.values(FEATURE_EVENTS)) {
    for (const e of events) allEvents.add(e);
  }
  return [...allEvents];
}
