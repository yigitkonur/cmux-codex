import {
  mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync,
  rmdirSync, readdirSync, statSync,
} from 'node:fs';
import { join } from 'node:path';
import type { SessionState } from './types.js';

const STATE_DIR = '/tmp/codex-cmux';
const LOCK_TIMEOUT_MS = 100;
const LOCK_SPIN_MS = 1;
const STALE_LOCK_MS = 5000;

export class StateManager {
  private readonly sessionId: string;
  private readonly stateFile: string;
  private readonly lockDir: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.stateFile = join(STATE_DIR, `${sessionId}.json`);
    this.lockDir = join(STATE_DIR, `${sessionId}.lock`);
  }

  createDefault(): SessionState {
    const now = Date.now();
    return {
      sessionId: this.sessionId,
      workspaceId: '',
      surfaceId: '',
      socketPath: '',
      codexPpid: 0,
      currentStatus: 'ready',
      toolUseCount: 0,
      turnToolCounts: [],
      gitBranch: null,
      gitDirty: false,
      model: null,
      isInTurn: false,
      turnNumber: 0,
      turnStartTime: 0,
      sessionStartTime: now,
      lastUpdateTime: now,
      toolHistory: [],
    };
  }

  read(): SessionState {
    try {
      this.ensureDir();
      const raw = readFileSync(this.stateFile, 'utf-8');
      return JSON.parse(raw) as SessionState;
    } catch {
      return this.createDefault();
    }
  }

  write(state: SessionState): void {
    try {
      this.ensureDir();
      state.lastUpdateTime = Date.now();
      const tmpFile = this.stateFile + '.tmp.' + process.pid;
      writeFileSync(tmpFile, JSON.stringify(state), 'utf-8');
      renameSync(tmpFile, this.stateFile);
    } catch {}
  }

  withState<T>(fn: (state: SessionState) => T): T {
    this.lock();
    try {
      const state = this.read();
      const result = fn(state);
      this.write(state);
      return result;
    } finally {
      this.unlock();
    }
  }

  delete(): void {
    try { unlinkSync(this.stateFile); } catch {}
    this.unlock();
  }

  /** Remove state files older than maxAgeMs. Also check ppid liveness. */
  cleanStale(maxAgeMs: number): void {
    try {
      this.ensureDir();
      const now = Date.now();
      const entries = readdirSync(STATE_DIR);
      for (const entry of entries) {
        if (!entry.endsWith('.json') || entry === 'config.cache.json') continue;
        const filePath = join(STATE_DIR, entry);
        try {
          const stat = statSync(filePath);
          if (now - stat.mtimeMs > maxAgeMs) {
            unlinkSync(filePath);
            try { rmdirSync(filePath.replace(/\.json$/, '.lock')); } catch {}
          }
        } catch {}
      }
    } catch {}
  }

  /** Check if a stored PID is still alive. */
  static isPidAlive(pid: number): boolean {
    if (!pid || pid <= 1) return false; // Reject init (1) and invalid PIDs
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /** Read all session state files for stale cleanup. */
  static readAllSessions(): Array<{ filePath: string; state: SessionState }> {
    const results: Array<{ filePath: string; state: SessionState }> = [];
    try {
      mkdirSync(STATE_DIR, { recursive: true });
      const entries = readdirSync(STATE_DIR);
      for (const entry of entries) {
        if (!entry.endsWith('.json') || entry === 'config.cache.json') continue;
        const filePath = join(STATE_DIR, entry);
        try {
          const raw = readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && typeof parsed.codexPpid === 'number') {
            results.push({ filePath, state: parsed as SessionState });
          }
        } catch {}
      }
    } catch {}
    return results;
  }

  private ensureDir(): void {
    try { mkdirSync(STATE_DIR, { recursive: true }); } catch {}
  }

  private lock(): void {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (true) {
      try { this.ensureDir(); mkdirSync(this.lockDir); return; } catch {
        this.breakStaleLock();
        if (Date.now() >= deadline) {
          this.forceUnlock();
          try { mkdirSync(this.lockDir); } catch {}
          return;
        }
        this.spinWait(LOCK_SPIN_MS);
      }
    }
  }

  private unlock(): void { try { rmdirSync(this.lockDir); } catch {} }
  private forceUnlock(): void { try { rmdirSync(this.lockDir); } catch {} }

  private breakStaleLock(): void {
    try {
      const stat = statSync(this.lockDir);
      if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) rmdirSync(this.lockDir);
    } catch {}
  }

  private spinWait(ms: number): void {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}
