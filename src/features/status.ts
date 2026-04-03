/**
 * Status priority system for the cmux sidebar (cmux-codex).
 * 5 phases: error > working > thinking > done > ready.
 */

import type { StatusPhase } from '../state/types.js';

export const STATUS_PRIORITY: Record<StatusPhase, number> = {
  error: 100,
  working: 50,
  thinking: 40,
  done: 30,
  ready: 10,
};

export const STATUS_DISPLAY: Record<StatusPhase, { icon: string; color: string }> = {
  ready:    { icon: 'checkmark.circle', color: '#50C878' },
  thinking: { icon: 'brain',           color: '#FFD700' },
  working:  { icon: 'hammer.fill',     color: '#4C8DFF' },
  done:     { icon: 'checkmark.seal',  color: '#50C878' },
  error:    { icon: 'xmark.circle',    color: '#FF4444' },
};

export function resolveStatus(current: StatusPhase, next: StatusPhase): StatusPhase {
  if (current === 'working' && next === 'working') return next;
  const currentPriority = STATUS_PRIORITY[current] ?? 0;
  const nextPriority = STATUS_PRIORITY[next] ?? 0;
  return nextPriority >= currentPriority ? next : current;
}

export function formatStatusValue(
  phase: StatusPhase,
  detail?: string,
): string {
  const label = phaseLabel(phase);
  if (detail) return `${label}: ${detail}`;
  return label;
}

function phaseLabel(phase: StatusPhase): string {
  switch (phase) {
    case 'ready':    return 'Ready';
    case 'thinking': return 'Thinking...';
    case 'working':  return 'Working';
    case 'done':     return 'Done';
    case 'error':    return 'Error';
  }
}
