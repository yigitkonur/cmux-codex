export interface CodexCmuxConfig {
  features: {
    statusPills: boolean;
    progress: boolean;
    logs: boolean;
    notifications: boolean;
    gitIntegration: boolean;
  };
  notifications: {
    onStop: boolean;
    onError: boolean;
  };
}
