/**
 * codex-cmux Installer
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { detectCmux, detectCodex, detectNode } from './detect.js';
import { runPrompts } from './prompts.js';
import { generateHooks, allCodexCmuxEvents } from './hooks-gen.js';
import { mergeHooksIntoFile, removeCodexCmuxHooks } from './merge.js';
import { ensureHooksEnabled } from './config-toml.js';
import { verifyInstallation } from './verify.js';

const INSTALL_DIR = join(homedir(), '.codex-cmux');
const HANDLER_DEST = join(INSTALL_DIR, 'handler.cjs');
const CONFIG_DEST = join(INSTALL_DIR, 'config.json');

function getDistDir(): string {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return join(process.cwd(), 'dist');
  }
}

export async function run(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' codex-cmux setup ')));

  const spin = p.spinner();
  spin.start('Detecting environment...');
  const cmux = detectCmux();
  const codex = detectCodex();
  const node = detectNode();
  spin.stop('Environment detected');

  const choices = await runPrompts(cmux, codex, node);
  if (!choices.confirmed) { p.cancel('Setup cancelled.'); return; }

  // Write config
  const spin2 = p.spinner();
  spin2.start('Writing configuration...');
  const config = {
    features: {
      statusPills: choices.features.includes('statusPills'),
      progress: choices.features.includes('progress'),
      logs: choices.features.includes('logs'),
      notifications: choices.features.includes('notifications'),
      gitIntegration: choices.features.includes('gitIntegration'),
    },
    notifications: choices.notifications,
  };
  mkdirSync(INSTALL_DIR, { recursive: true });
  writeFileSync(CONFIG_DEST, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  try { const c = '/tmp/codex-cmux/config.cache.json'; if (existsSync(c)) rmSync(c); } catch {}
  spin2.stop('Configuration written');

  // Copy handler
  const spin3 = p.spinner();
  spin3.start('Installing handler...');
  const distDir = getDistDir();
  const handlerSrc = join(distDir, 'handler.cjs');
  if (existsSync(handlerSrc)) {
    copyFileSync(handlerSrc, HANDLER_DEST);
    spin3.stop('Handler installed');
  } else {
    spin3.stop(pc.yellow('Handler not found in dist/ — run "npm run build" first'));
  }

  // Enable hooks in config.toml
  const spin4 = p.spinner();
  spin4.start('Enabling Codex hooks...');
  const tomlResult = ensureHooksEnabled(codex.configTomlPath);
  if (tomlResult.alreadyEnabled) {
    spin4.stop('Hooks already enabled in config.toml');
  } else if (tomlResult.modified) {
    spin4.stop('Enabled codex_hooks = true in config.toml');
  }

  // Generate and merge hooks.json
  const spin5 = p.spinner();
  spin5.start('Merging hooks into hooks.json...');
  const hooks = generateHooks(choices.features, '~/.codex-cmux/handler.cjs');
  const mergeResult = mergeHooksIntoFile(codex.hooksJsonPath, hooks);
  if (mergeResult.merged) {
    spin5.stop('Hooks merged');
  } else {
    spin5.stop(pc.red('Failed to merge hooks'));
  }

  // Merge report
  const reportLines: string[] = [];
  if (mergeResult.added.length > 0) reportLines.push(`${pc.green('Added:')} ${mergeResult.added.join(', ')}`);
  if (mergeResult.updated.length > 0) reportLines.push(`${pc.yellow('Updated:')} ${mergeResult.updated.join(', ')}`);
  if (mergeResult.preserved.length > 0) reportLines.push(`${pc.blue('Preserved:')} ${mergeResult.preserved.join(', ')}`);
  if (mergeResult.backup) reportLines.push(pc.dim(`Backup: ${mergeResult.backup}`));
  if (reportLines.length > 0) p.note(reportLines.join('\n'), 'Merge Report');

  // Verify
  const spin6 = p.spinner();
  spin6.start('Verifying installation...');
  const verify = await verifyInstallation(HANDLER_DEST);
  spin6.stop('Verification complete');
  const verifyLines = verify.checks.map((c) => {
    const icon = c.passed ? pc.green('\u2713') : pc.red('\u2717');
    return `${icon} ${c.name}: ${pc.dim(c.detail)}`;
  });
  p.note(verifyLines.join('\n'), 'Verification');

  if (verify.allPassed) {
    p.outro(pc.green('codex-cmux is installed and ready!'));
  } else {
    const failCount = verify.checks.filter((c) => !c.passed).length;
    p.outro(pc.yellow(`Installed with ${failCount} warning(s). Run "codex-cmux status" to check.`));
  }
}

export async function status(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' codex-cmux status ')));
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  checks.push({ name: 'Handler', ok: existsSync(HANDLER_DEST), detail: existsSync(HANDLER_DEST) ? HANDLER_DEST : 'Not installed' });
  checks.push({ name: 'Config', ok: existsSync(CONFIG_DEST), detail: existsSync(CONFIG_DEST) ? CONFIG_DEST : 'Not found' });

  const cmux = detectCmux();
  checks.push({ name: 'Socket', ok: cmux.socketOk, detail: cmux.socketOk ? `Connected (${cmux.latencyMs}ms)` : 'Not responding' });

  const codex = detectCodex();
  checks.push({ name: 'Codex hooks', ok: codex.hooksEnabled, detail: codex.hooksEnabled ? 'Enabled' : 'Disabled in config.toml' });

  const lines = checks.map((c) => `${c.ok ? pc.green('\u2713') : pc.red('\u2717')} ${c.name}: ${pc.dim(c.detail)}`);
  p.note(lines.join('\n'), 'Health Check');

  const allOk = checks.every((c) => c.ok);
  p.outro(allOk ? pc.green('All systems operational') : pc.yellow(`${checks.filter((c) => !c.ok).length} issue(s) detected.`));
}

export async function uninstall(): Promise<void> {
  p.intro(pc.bgRed(pc.white(' codex-cmux uninstall ')));
  const confirmed = await p.confirm({ message: 'Remove all codex-cmux hooks and configuration?', initialValue: false });
  if (p.isCancel(confirmed) || !confirmed) { p.cancel('Cancelled.'); return; }

  const codex = detectCodex();
  const result = removeCodexCmuxHooks(codex.hooksJsonPath);
  if (result.removed.length > 0) p.log.info(`Removed hooks: ${result.removed.join(', ')}`);

  if (existsSync(INSTALL_DIR)) {
    try { rmSync(INSTALL_DIR, { recursive: true, force: true }); p.log.info('Removed ~/.codex-cmux/'); } catch {}
  }
  try { const tmp = '/tmp/codex-cmux'; if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true }); } catch {}

  p.outro(pc.green('codex-cmux has been uninstalled.'));
}

export async function test(): Promise<void> {
  p.intro(pc.bgMagenta(pc.white(' codex-cmux test ')));

  if (!existsSync(HANDLER_DEST)) { p.cancel('Handler not installed. Run "codex-cmux setup" first.'); return; }
  const cmux = detectCmux();
  if (!cmux.available) { p.cancel('cmux is not available.'); return; }

  const sessionId = `test-${Date.now()}`;
  const base = { session_id: sessionId, transcript_path: null, cwd: process.cwd(), model: 'test-model' };

  const fire = (event: Record<string, unknown>): void => {
    try {
      const json = JSON.stringify(event);
      execSync(`echo '${json.replace(/'/g, "'\\''")}' | node "${HANDLER_DEST}"`, { timeout: 5000, env: process.env });
    } catch {}
  };
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  await p.tasks([
    { title: 'SessionStart', task: async () => { fire({ ...base, hook_event_name: 'SessionStart', source: 'startup' }); await sleep(500); return 'Fired'; } },
    { title: 'UserPromptSubmit', task: async () => { fire({ ...base, hook_event_name: 'UserPromptSubmit', turn_id: 't1', prompt: 'Test prompt' }); await sleep(500); return 'Fired'; } },
    { title: 'PreToolUse (Bash)', task: async () => { fire({ ...base, hook_event_name: 'PreToolUse', turn_id: 't1', tool_name: 'Bash', tool_use_id: 'tu1', tool_input: { command: 'echo hello' } }); await sleep(500); return 'Fired'; } },
    { title: 'PostToolUse (Bash)', task: async () => { fire({ ...base, hook_event_name: 'PostToolUse', turn_id: 't1', tool_name: 'Bash', tool_use_id: 'tu1', tool_input: { command: 'echo hello' }, tool_response: 'hello' }); await sleep(500); return 'Fired'; } },
    { title: 'Stop', task: async () => { fire({ ...base, hook_event_name: 'Stop', turn_id: 't1', stop_hook_active: false, last_assistant_message: 'Test complete.' }); await sleep(2000); return 'Fired'; } },
  ]);

  p.outro(pc.green('Test events fired. Check your cmux sidebar!'));
}
