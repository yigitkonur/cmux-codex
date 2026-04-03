/** Shared context passed to all event handlers. */

import type { CmuxSocket } from '../cmux/socket.js';
import type { CmuxCommands } from '../cmux/commands.js';
import type { V2Emitter } from '../cmux/v2-emitter.js';
import type { StateManager } from '../state/manager.js';
import type { CodexCmuxConfig } from '../config/types.js';
import type { CmuxEnv } from '../util/env.js';

export interface HandlerContext {
  socket: CmuxSocket;
  cmd: CmuxCommands;
  v2: V2Emitter;
  state: StateManager;
  config: CodexCmuxConfig;
  env: CmuxEnv;
  isTcp: boolean;
}
