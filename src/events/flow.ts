/**
 * Conversation flow handlers: UserPromptSubmit and Stop.
 *
 * CRITICAL: onStop MUST NOT write anything to stdout.
 * In Codex, any JSON on stdout from a Stop hook is interpreted as a
 * directive — decision:"block" means "inject prompt and continue the turn."
 * The Stop handler updates the sidebar and exits silently.
 */

import type { HandlerContext } from './context.js';
import type { UserPromptSubmitInput, StopInput } from './types.js';
import { statusCmd, notifyIfUnfocused } from '../cmux/helpers.js';
import { TURN_HISTORY_MAX } from '../constants.js';

export async function onUserPromptSubmit(
  event: UserPromptSubmitInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config } = ctx;

  state.withState((s) => {
    if (s.toolUseCount > 0) {
      s.turnToolCounts.push(s.toolUseCount);
      if (s.turnToolCounts.length > TURN_HISTORY_MAX) {
        s.turnToolCounts = s.turnToolCounts.slice(-TURN_HISTORY_MAX);
      }
    }
    s.toolUseCount = 0;
    s.currentStatus = 'thinking';
    s.isInTurn = true;
    s.turnNumber++;
    s.turnStartTime = Date.now();
  });

  const commands: string[] = [];
  commands.push(cmd.clearNotifications());
  commands.push(cmd.markRead());
  commands.push(statusCmd(cmd, 'thinking'));

  if (config.features.progress) {
    commands.push(cmd.clearProgress());
  }

  socket.fireAll(commands);
}

/**
 * Handle Stop — transition to "Done", send focus-aware notification.
 *
 * MUST NOT write to stdout. Any output would be interpreted by Codex
 * as a "continue" directive. This is the most critical behavioral
 * difference from cc-cmux.
 */
export async function onStop(
  event: StopInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config, env } = ctx;

  state.withState((st) => {
    st.currentStatus = 'done';
    st.isInTurn = false;
  });

  const commands: string[] = [];
  commands.push(cmd.clearNotifications());

  // Always set Done (not gated by statusPills — this is a cleanup)
  commands.push(statusCmd(cmd, 'done'));

  if (config.features.progress) {
    commands.push(cmd.setProgress(1.0, 'Complete'));
  }

  socket.fireAll(commands);

  // Focus-aware notification
  if (config.features.notifications && config.notifications.onStop) {
    const lastMsg = (event.last_assistant_message || 'Response complete').slice(0, 100);
    await notifyIfUnfocused(socket, cmd, env, 'Done', lastMsg);
  }

  // CRITICAL: No stdout output. Exit silently.
}
