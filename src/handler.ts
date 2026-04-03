/**
 * cmux-codex main handler — single entry point invoked by Codex hooks.
 *
 * 5 events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop.
 * Always exits 0 — must NEVER block Codex.
 * CRITICAL: Stop handler must NEVER produce stdout output.
 */

import { isCmuxAvailable, getCmuxEnv } from './util/env.js';
import { readStdin } from './util/stdin.js';
import { loadConfig } from './config/loader.js';
import { CmuxSocket } from './cmux/socket.js';
import { CmuxCommands } from './cmux/commands.js';
import { StateManager } from './state/manager.js';

import type { AnyHookEventInput } from './events/types.js';
import type { HandlerContext } from './events/context.js';

import { onSessionStart } from './events/session.js';
import { onPreToolUse, onPostToolUse } from './events/tools.js';
import { onUserPromptSubmit, onStop } from './events/flow.js';

function parseEvent(raw: string): AnyHookEventInput | null {
  try {
    const obj = JSON.parse(raw);
    return obj?.hook_event_name ? (obj as AnyHookEventInput) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!isCmuxAvailable()) process.exit(0);

  const raw = await readStdin(500);
  if (!raw) process.exit(0);

  const event = parseEvent(raw);
  if (!event) process.exit(0);

  const config = loadConfig();
  const env = getCmuxEnv();
  const cmuxBin = process.env['CMUX_BIN'] ?? 'cmux';
  const socket = new CmuxSocket(env.socketPath, cmuxBin);
  const cmd = new CmuxCommands(env.workspaceId);
  const state = new StateManager(event.session_id);
  const ctx: HandlerContext = { socket, cmd, state, config, env };

  try {
    switch (event.hook_event_name) {
      case 'SessionStart':
        await onSessionStart(event, ctx);
        break;
      case 'UserPromptSubmit':
        await onUserPromptSubmit(event, ctx);
        break;
      case 'PreToolUse':
        await onPreToolUse(event, ctx);
        break;
      case 'PostToolUse':
        await onPostToolUse(event, ctx);
        break;
      case 'Stop':
        await onStop(event, ctx);
        break;
    }
  } catch {
    // Swallow all errors
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  process.exit(0);
}

process.on('uncaughtException', () => process.exit(0));
process.on('unhandledRejection', () => process.exit(0));
main().catch(() => process.exit(0));
