/**
 * Session lifecycle handler: SessionStart.
 *
 * Codex has NO SessionEnd hook. Cleanup is handled by:
 * 1. ppid liveness check at each SessionStart (detect dead Codex processes)
 * 2. cmux's built-in 30s PID check via set_agent_pid
 * 3. Age-based stale file cleanup (24h)
 */

import type { HandlerContext } from './context.js';
import type { SessionStartInput } from './types.js';
import type { V2RpcCall } from '../cmux/v2-emitter.js';
import { STATUS_DISPLAY, formatStatusValue } from '../features/status.js';
import { detectGitInfo } from '../features/git.js';
import { LOG_SOURCE } from '../features/logger.js';
import { AGENT_KEY, META_HOST, META_REMOTE_CWD, STALE_SESSION_MS } from '../constants.js';
import { V2_COLORS, formatWorkspaceStatus } from '../cmux/v2-emitter.js';
import { StateManager } from '../state/manager.js';
import { CmuxSocket } from '../cmux/socket.js';
import { CmuxCommands } from '../cmux/commands.js';
import { hostname } from 'node:os';
import { unlinkSync } from 'node:fs';

export async function onSessionStart(
  event: SessionStartInput,
  ctx: HandlerContext,
): Promise<void> {
  if (ctx.isTcp) {
    return onSessionStartV2(event, ctx);
  }

  const { socket, cmd, state, config, env } = ctx;
  const s = state.createDefault();
  s.sessionId = event.session_id;
  s.workspaceId = env.workspaceId;
  s.surfaceId = env.surfaceId;
  s.socketPath = env.socketPath;
  s.model = event.model ?? null;
  s.codexPpid = process.ppid || process.pid;
  s.sessionStartTime = Date.now();

  // Detect git info
  if (config.features.gitIntegration && event.cwd) {
    try {
      const gitInfo = detectGitInfo(event.cwd);
      s.gitBranch = gitInfo.branch;
      s.gitDirty = gitInfo.dirty;
    } catch {}
  }

  state.write(s);

  // Build sidebar initialization commands
  const commands: string[] = [];

  // Register PID — enables cmux's 30s crash recovery
  const pid = process.ppid || process.pid;
  commands.push(cmd.setAgentPid(AGENT_KEY, pid));

  // Clear previous state
  commands.push(cmd.clearLog());
  commands.push(cmd.clearNotifications());

  // Set status to Ready
  if (config.features.statusPills) {
    const display = STATUS_DISPLAY.ready;
    commands.push(
      cmd.setStatus(AGENT_KEY, formatStatusValue('ready'), {
        icon: display.icon,
        color: display.color,
        pid,
      }),
    );
  }

  // Report git branch
  if (config.features.gitIntegration && s.gitBranch) {
    commands.push(cmd.reportGitBranch(s.gitBranch, s.gitDirty));
  }

  // Detect SSH / remote session
  const isSSH = !!(process.env['SSH_CONNECTION'] || process.env['SSH_CLIENT'] || process.env['SSH_TTY']);
  if (isSSH) {
    const user = process.env['USER'] || process.env['LOGNAME'] || '';
    const hostLabel = user ? `${user}@${hostname()}` : hostname();
    commands.push(cmd.reportMeta(META_HOST, `${hostLabel} (ssh)`, { icon: 'network', color: '#F59E0B' }));
    if (event.cwd) {
      commands.push(cmd.reportMeta(META_REMOTE_CWD, event.cwd, { icon: 'folder', color: '#6B7280' }));
    }
    if (config.features.logs) {
      commands.push(cmd.log(`SSH session: ${hostLabel}`, { level: 'info', source: LOG_SOURCE }));
    }
  } else {
    commands.push(cmd.clearMeta(META_HOST));
    commands.push(cmd.clearMeta(META_REMOTE_CWD));
  }

  socket.fireAll(commands);

  // Clean up stale sessions (dead Codex processes + age-based)
  try {
    cleanStaleSessions(socket, cmd);
  } catch {}

  try {
    state.cleanStale(STALE_SESSION_MS);
  } catch {}
}

// ---- V2 SSH branch ----

async function onSessionStartV2(
  event: SessionStartInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, v2, state, config } = ctx;

  // Create and populate initial state (same as V1)
  const s = state.createDefault();
  s.sessionId = event.session_id;
  s.workspaceId = ctx.env.workspaceId;
  s.surfaceId = ctx.env.surfaceId;
  s.socketPath = ctx.env.socketPath;
  s.model = event.model ?? null;
  s.codexPpid = process.ppid || process.pid;
  s.sessionStartTime = Date.now();

  // Detect git info
  if (config.features.gitIntegration && event.cwd) {
    try {
      const gitInfo = detectGitInfo(event.cwd);
      s.gitBranch = gitInfo.branch;
      s.gitDirty = gitInfo.dirty;
    } catch {}
  }

  state.write(s);

  // V2 initialization calls
  const calls: V2RpcCall[] = [];

  // Tab title: stable project name (set once)
  const projectName = event.cwd ? event.cwd.split('/').filter(Boolean).pop() || 'remote' : 'remote';
  calls.push(v2.setTabTitle(projectName));

  // Workspace color: green (ready)
  calls.push(v2.setWorkspaceColor(V2_COLORS.ready));

  // Workspace title: live status "Ready | main*"
  calls.push(v2.setWorkspaceTitle(formatWorkspaceStatus('Ready', undefined, s.gitBranch, s.gitDirty)));

  calls.push(v2.clearNotifications());
  calls.push(v2.markRead());

  socket.fireV2All(calls);

  // Clean up stale sessions (same as V1)
  try {
    cleanStaleSessions(socket, ctx.cmd);
  } catch {}

  try {
    state.cleanStale(STALE_SESSION_MS);
  } catch {}
}

/**
 * Check all session state files for dead Codex parent processes.
 * If the stored codexPpid is no longer alive, clear that session's sidebar.
 */
function cleanStaleSessions(socket: CmuxSocket, cmd: CmuxCommands): void {
  const sessions = StateManager.readAllSessions();
  for (const { filePath, state: s } of sessions) {
    if (s.codexPpid && !StateManager.isPidAlive(s.codexPpid)) {
      // Codex process is dead — clear its sidebar state
      if (s.workspaceId) {
        const staleCmds = new CmuxCommands(s.workspaceId);
        socket.fire(staleCmds.clearStatus(AGENT_KEY));
        socket.fire(staleCmds.clearAgentPid(AGENT_KEY));
        socket.fire(staleCmds.clearProgress());
      }
      try { unlinkSync(filePath); } catch {}
    }
  }
}
