export type StatusPhase = 'ready' | 'thinking' | 'working' | 'done' | 'error';

export interface ToolHistoryEntry {
  toolName: string;
  summary: string;
  timestamp: number;
}

export interface SessionState {
  sessionId: string;
  workspaceId: string;
  surfaceId: string;
  socketPath: string;
  codexPpid: number;
  currentStatus: StatusPhase;
  toolUseCount: number;
  turnToolCounts: number[];
  gitBranch: string | null;
  gitDirty: boolean;
  model: string | null;
  isInTurn: boolean;
  turnNumber: number;
  turnStartTime: number;
  sessionStartTime: number;
  lastUpdateTime: number;
  toolHistory: ToolHistoryEntry[];
}
