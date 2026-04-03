import type { CodexCmuxConfig } from './types.js';

export const DEFAULT_CONFIG: CodexCmuxConfig = {
  features: {
    statusPills: true,
    progress: true,
    logs: true,
    notifications: true,
    gitIntegration: true,
  },
  notifications: {
    onStop: true,
    onError: true,
  },
};
