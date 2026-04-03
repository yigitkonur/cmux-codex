import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface CmuxDetection {
  available: boolean;
  socketPath: string;
  socketOk: boolean;
  latencyMs: number;
}

export interface CodexDetection {
  installed: boolean;
  configTomlPath: string;
  configTomlExists: boolean;
  hooksEnabled: boolean;
  hooksJsonPath: string;
  hooksJsonExists: boolean;
}

export interface NodeDetection {
  version: string;
  path: string;
}

export function detectCmux(): CmuxDetection {
  const socketPath = process.env['CMUX_SOCKET_PATH'] || '';
  if (!socketPath) return { available: false, socketPath: '', socketOk: false, latencyMs: 0 };

  let socketOk = false;
  let latencyMs = 0;
  try {
    const start = Date.now();
    execSync(`echo 'ping' | socat - UNIX-CONNECT:"${socketPath}" 2>/dev/null`, { timeout: 2000 });
    latencyMs = Date.now() - start;
    socketOk = true;
  } catch {}

  return { available: true, socketPath, socketOk, latencyMs };
}

export function detectCodex(): CodexDetection {
  const codexDir = join(homedir(), '.codex');
  const configTomlPath = join(codexDir, 'config.toml');
  const hooksJsonPath = join(codexDir, 'hooks.json');
  const configTomlExists = existsSync(configTomlPath);
  const hooksJsonExists = existsSync(hooksJsonPath);

  let installed = false;
  try {
    execSync('command -v codex', { timeout: 2000, stdio: 'ignore' });
    installed = true;
  } catch {}

  let hooksEnabled = false;
  if (configTomlExists) {
    try {
      const content = readFileSync(configTomlPath, 'utf-8');
      hooksEnabled = /codex_hooks\s*=\s*true/i.test(content);
    } catch {}
  }

  return { installed, configTomlPath, configTomlExists, hooksEnabled, hooksJsonPath, hooksJsonExists };
}

export function detectNode(): NodeDetection {
  return {
    version: process.version,
    path: process.execPath,
  };
}
