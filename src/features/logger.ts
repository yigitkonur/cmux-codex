/**
 * Sidebar log formatting for codex-cmux.
 * Currently Codex only fires PostToolUse for Bash.
 */

export const LOG_SOURCE = 'codex';

export function formatToolLog(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResponse?: unknown,
): string {
  if (toolName === 'Bash') {
    const command = toolInput['command'];
    if (typeof command !== 'string') return 'Bash';
    const truncated = truncate(command.trim(), 40);
    const exitCode = extractExitCode(toolResponse);
    if (exitCode !== null) return `Bash: \`${truncated}\` → exit ${exitCode}`;
    return `Bash: \`${truncated}\``;
  }
  // Future-proof: pass through unknown tool names
  return toolName;
}

export function getLogLevel(_toolName: string, isFailure: boolean): string {
  return isFailure ? 'warning' : 'info';
}

function truncate(str: string, maxLen: number): string {
  const cleaned = str.replace(/\n/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + '\u2026';
}

function extractExitCode(response: unknown): number | null {
  if (!response || typeof response !== 'object') return null;
  const resp = response as Record<string, unknown>;
  if (typeof resp['exitCode'] === 'number') return resp['exitCode'];
  if (typeof resp['exit_code'] === 'number') return resp['exit_code'];
  if (typeof resp['content'] === 'string') {
    const match = resp['content'].match(/exit code[:\s]*(\d+)/i);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}
