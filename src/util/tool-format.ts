/** Format tool name + input into a human-readable label for the status pill. */

export function formatToolLabel(toolName: string, toolInput: Record<string, unknown>): string {
  if (toolName === 'Bash') {
    const command = toolInput['command'];
    if (typeof command === 'string') {
      const cleaned = command.replace(/\n/g, ' ').trim();
      return cleaned.length <= 30 ? `Bash: ${cleaned}` : `Bash: ${cleaned.slice(0, 29)}\u2026`;
    }
    return 'Bash';
  }
  return toolName;
}
