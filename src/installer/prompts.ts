import * as p from '@clack/prompts';
import type { CmuxDetection, CodexDetection, NodeDetection } from './detect.js';

export interface InstallerChoices {
  features: string[];
  notifications: { onStop: boolean; onError: boolean };
  confirmed: boolean;
}

export async function runPrompts(
  cmux: CmuxDetection,
  codex: CodexDetection,
  node: NodeDetection,
): Promise<InstallerChoices> {
  // Show detection results
  p.note(
    [
      `cmux: ${cmux.available ? `\u2713 socket ${cmux.socketOk ? 'ok' : 'not responding'}` : '\u2717 not detected'}`,
      `Codex: ${codex.installed ? '\u2713 installed' : '\u2717 not found'} | hooks: ${codex.hooksEnabled ? 'enabled' : 'disabled'}`,
      `Node: ${node.version}`,
    ].join('\n'),
    'Environment',
  );

  const features = await p.multiselect({
    message: 'Select features:',
    options: [
      { value: 'statusPills', label: 'Status pills', hint: 'Ready/Thinking/Working/Done' },
      { value: 'progress', label: 'Progress bar', hint: 'Adaptive n/(n+K)' },
      { value: 'logs', label: 'Sidebar logs', hint: 'Bash command results' },
      { value: 'notifications', label: 'Desktop notifications', hint: 'Focus-aware' },
      { value: 'gitIntegration', label: 'Git integration', hint: 'Branch + dirty state' },
    ],
    initialValues: ['statusPills', 'progress', 'logs', 'notifications', 'gitIntegration'],
    required: true,
  });

  if (p.isCancel(features)) return { features: [], notifications: { onStop: true, onError: true }, confirmed: false };

  const confirmed = await p.confirm({ message: 'Install codex-cmux?', initialValue: true });
  if (p.isCancel(confirmed)) return { features: features as string[], notifications: { onStop: true, onError: true }, confirmed: false };

  return {
    features: features as string[],
    notifications: { onStop: true, onError: true },
    confirmed: confirmed as boolean,
  };
}
