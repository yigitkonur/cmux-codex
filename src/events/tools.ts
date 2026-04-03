/**
 * Tool lifecycle handlers: PreToolUse and PostToolUse.
 * Currently Codex only fires these for Bash commands.
 */

import type { HandlerContext } from './context.js';
import type { PreToolUseInput, PostToolUseInput } from './types.js';
import { formatToolLabel } from '../util/tool-format.js';
import { resolveStatus } from '../features/status.js';
import { formatToolLog, getLogLevel, LOG_SOURCE } from '../features/logger.js';
import { calculateProgress, formatProgressLabel } from '../state/progress.js';
import { detectGitInfo, isGitCommand } from '../features/git.js';
import { fireStatus } from '../cmux/helpers.js';
import { TOOL_HISTORY_MAX, RESPONSE_TRUNCATE } from '../constants.js';

export async function onPreToolUse(
  event: PreToolUseInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config } = ctx;
  const { tool_name: toolName, tool_input: toolInput } = event;

  const label = formatToolLabel(toolName, toolInput as Record<string, unknown>);

  state.withState((s) => {
    s.toolUseCount++;
    const resolved = resolveStatus(s.currentStatus, 'working');
    s.currentStatus = resolved;

    if (config.features.statusPills) {
      fireStatus(socket, cmd, 'working', label);
    }

    if (config.features.progress) {
      const progress = calculateProgress(s.toolUseCount, s.turnToolCounts);
      const progressLabel = formatProgressLabel(s.toolUseCount);
      socket.fire(cmd.setProgress(progress, progressLabel));
    }
  });
}

export async function onPostToolUse(
  event: PostToolUseInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config } = ctx;
  const { tool_name: toolName, tool_input: toolInput } = event;

  // Safely handle tool_response
  let toolResponse: unknown = undefined;
  try {
    const raw = event.tool_response;
    if (raw == null) {
      toolResponse = undefined;
    } else if (typeof raw === 'string') {
      toolResponse = { content: raw.length > RESPONSE_TRUNCATE ? raw.slice(0, RESPONSE_TRUNCATE) : raw };
    } else if (typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      toolResponse = {
        content: typeof r['content'] === 'string' ? r['content'].slice(0, RESPONSE_TRUNCATE) : undefined,
        exitCode: r['exitCode'] ?? r['exit_code'],
      };
    }
  } catch {
    toolResponse = undefined;
  }

  // Log the tool result
  if (config.features.logs) {
    try {
      const logMsg = formatToolLog(toolName, toolInput as Record<string, unknown>, toolResponse);
      const level = getLogLevel(toolName, false);
      socket.fire(cmd.log(logMsg, { level: level as 'info' | 'warning', source: LOG_SOURCE }));
    } catch {
      try { socket.fire(cmd.log(toolName, { level: 'info', source: LOG_SOURCE })); } catch {}
    }
  }

  // Update tool history
  try {
    state.withState((s) => {
      const summary = formatToolLog(toolName, toolInput as Record<string, unknown>);
      s.toolHistory.push({ toolName, summary, timestamp: Date.now() });
      if (s.toolHistory.length > TOOL_HISTORY_MAX) {
        s.toolHistory = s.toolHistory.slice(-TOOL_HISTORY_MAX);
      }
    });
  } catch {}

  // Refresh git on git commands
  if (config.features.gitIntegration && toolName === 'Bash') {
    const command = toolInput['command'];
    if (typeof command === 'string' && isGitCommand(command)) {
      try {
        const gitInfo = detectGitInfo(event.cwd);
        state.withState((s) => {
          s.gitBranch = gitInfo.branch;
          s.gitDirty = gitInfo.dirty;
        });
        if (gitInfo.branch) {
          socket.fire(cmd.reportGitBranch(gitInfo.branch, gitInfo.dirty));
        }
      } catch {}
    }
  }
}
