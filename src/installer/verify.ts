import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export interface CheckResult { name: string; passed: boolean; detail: string; }
export interface VerifyResult { checks: CheckResult[]; allPassed: boolean; }

export async function verifyInstallation(handlerPath: string): Promise<VerifyResult> {
  const checks: CheckResult[] = [];

  // 1. Handler exists
  checks.push({
    name: 'Handler file',
    passed: existsSync(handlerPath),
    detail: existsSync(handlerPath) ? 'Found' : 'Missing',
  });

  // 2. Handler cold start
  if (existsSync(handlerPath)) {
    try {
      const start = Date.now();
      execSync(`echo '{}' | node "${handlerPath}"`, { timeout: 3000, encoding: 'utf-8' });
      const elapsed = Date.now() - start;
      checks.push({
        name: 'Handler cold start',
        passed: elapsed < 3000,
        detail: `${elapsed}ms`,
      });
    } catch {
      checks.push({ name: 'Handler cold start', passed: false, detail: 'Failed to execute' });
    }
  }

  // 3. Socket ping
  const socketPath = process.env['CMUX_SOCKET_PATH'];
  if (socketPath) {
    try {
      execSync(`echo 'ping' | socat - UNIX-CONNECT:"${socketPath}" 2>/dev/null`, { timeout: 2000 });
      checks.push({ name: 'Socket ping', passed: true, detail: 'Connected' });
    } catch {
      checks.push({ name: 'Socket ping', passed: false, detail: 'Not responding' });
    }
  } else {
    checks.push({ name: 'Socket ping', passed: false, detail: 'CMUX_SOCKET_PATH not set' });
  }

  return { checks, allPassed: checks.every((c) => c.passed) };
}
