/**
 * cmux-codex Installer
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
  p.intro(pc.bgCyan(pc.black(' cmux-codex setup ')));

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

  // Socket symlink for SSH forwarding (spaces in socket path break SSH -R)
  const shellProfile = join(homedir(), '.zshrc');
  try {
    const profileContent = existsSync(shellProfile) ? readFileSync(shellProfile, 'utf-8') : '';
    if (!profileContent.includes('cmux-local.sock')) {
      const symBlock = [
        '',
        '# cmux-codex: symlink cmux socket (spaces in path break SSH -R)',
        'if [ -S "$CMUX_SOCKET_PATH" ]; then',
        '  ln -sf "$CMUX_SOCKET_PATH" /tmp/cmux-local.sock 2>/dev/null',
        'fi',
      ].join('\n');
      writeFileSync(shellProfile, profileContent + symBlock + '\n', 'utf-8');
      p.log.info('Added cmux socket symlink to ~/.zshrc');
    }
  } catch {}

  // Optional SSH remote setup
  const wantSSH = await p.confirm({
    message: 'Set up SSH remote integration? (sidebar works over SSH)',
    initialValue: false,
  });

  if (!p.isCancel(wantSSH) && wantSSH) {
    const remoteHost = await p.text({
      message: 'SSH host name (as in ~/.ssh/config):',
      placeholder: 'myserver',
      validate: (v) => (v.trim() ? undefined : 'Host name required'),
    });

    if (!p.isCancel(remoteHost) && remoteHost) {
      const host = (remoteHost as string).trim();
      const sshConfigPath = join(homedir(), '.ssh', 'config');
      try {
        let sshContent = existsSync(sshConfigPath) ? readFileSync(sshConfigPath, 'utf-8') : '';
        if (!sshContent.includes('/tmp/cmux-fwd.sock')) {
          const block = [
            '',
            `# cmux-codex: socket + env forwarding for sidebar integration`,
            `Host ${host}`,
            `    RemoteForward /tmp/cmux-fwd.sock /tmp/cmux-local.sock`,
            `    SendEnv CMUX_WORKSPACE_ID CMUX_SURFACE_ID CMUX_TAB_ID CMUX_PANEL_ID`,
          ].join('\n');
          mkdirSync(join(homedir(), '.ssh'), { recursive: true });
          writeFileSync(sshConfigPath, sshContent + block + '\n', 'utf-8');
          p.log.info(`Added socket forwarding for ${host} to SSH config`);
        } else {
          p.log.info('SSH config already has socket forwarding');
        }
      } catch {
        p.log.warn('Could not update SSH config. Add manually to ~/.ssh/config');
      }

      // Deploy handler to remote
      const deployRemote = await p.confirm({ message: `Deploy handler to ${host}?`, initialValue: true });
      if (!p.isCancel(deployRemote) && deployRemote) {
        try {
          execSync(`ssh ${host} 'mkdir -p ~/.codex-cmux'`, { timeout: 10000 });
          execSync(`scp ~/.codex-cmux/handler.cjs ${host}:~/.codex-cmux/handler.cjs`, { timeout: 30000 });
          p.log.info(`Handler deployed to ${host}:~/.codex-cmux/handler.cjs`);
        } catch {
          p.log.warn(`Could not deploy. Copy manually: scp ~/.codex-cmux/handler.cjs ${host}:~/.codex-cmux/`);
        }
      }
    }
  }

  if (verify.allPassed) {
    p.outro(pc.green('cmux-codex is installed and ready!'));
  } else {
    const failCount = verify.checks.filter((c) => !c.passed).length;
    p.outro(pc.yellow(`Installed with ${failCount} warning(s). Run "cmux-codex status" to check.`));
  }
}

export async function status(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' cmux-codex status ')));
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  checks.push({ name: 'Handler', ok: existsSync(HANDLER_DEST), detail: existsSync(HANDLER_DEST) ? HANDLER_DEST : 'Not installed' });
  checks.push({ name: 'Config', ok: existsSync(CONFIG_DEST), detail: existsSync(CONFIG_DEST) ? CONFIG_DEST : 'Not found' });

  const cmux = detectCmux();
  checks.push({ name: 'Socket', ok: cmux.socketOk, detail: cmux.socketOk ? `Connected (${cmux.latencyMs}ms)` : 'Not responding' });

  const codex = detectCodex();
  checks.push({ name: 'Codex hooks', ok: codex.hooksEnabled, detail: codex.hooksEnabled ? 'Enabled' : 'Disabled in config.toml' });

  // Check registered hooks
  let registeredEvents: string[] = [];
  if (codex.hooksJsonExists) {
    try {
      const hooksContent = JSON.parse(readFileSync(codex.hooksJsonPath, 'utf-8'));
      if (hooksContent?.hooks) {
        for (const [eventName, entries] of Object.entries(hooksContent.hooks)) {
          if (Array.isArray(entries)) {
            const hasCodexCmux = (entries as Record<string, unknown>[]).some((e) => {
              const h = e['hooks'] as Array<Record<string, string>> | undefined;
              return h?.some((hook) => typeof hook['command'] === 'string' && hook['command'].includes('codex-cmux'));
            });
            if (hasCodexCmux) registeredEvents.push(eventName);
          }
        }
      }
    } catch {}
  }
  checks.push({
    name: 'Hooks',
    ok: registeredEvents.length > 0,
    detail: registeredEvents.length > 0 ? `${registeredEvents.length} events: ${registeredEvents.join(', ')}` : 'No cmux-codex hooks registered',
  });

  const lines = checks.map((c) => `${c.ok ? pc.green('\u2713') : pc.red('\u2717')} ${c.name}: ${pc.dim(c.detail)}`);
  p.note(lines.join('\n'), 'Health Check');

  const allOk = checks.every((c) => c.ok);
  p.outro(allOk ? pc.green('All systems operational') : pc.yellow(`${checks.filter((c) => !c.ok).length} issue(s) detected.`));
}

export async function uninstall(): Promise<void> {
  p.intro(pc.bgRed(pc.white(' cmux-codex uninstall ')));
  const confirmed = await p.confirm({ message: 'Remove all cmux-codex hooks and configuration?', initialValue: false });
  if (p.isCancel(confirmed) || !confirmed) { p.cancel('Cancelled.'); return; }

  const codex = detectCodex();
  const result = removeCodexCmuxHooks(codex.hooksJsonPath);
  if (result.removed.length > 0) p.log.info(`Removed hooks: ${result.removed.join(', ')}`);

  if (existsSync(INSTALL_DIR)) {
    try { rmSync(INSTALL_DIR, { recursive: true, force: true }); p.log.info('Removed ~/.codex-cmux/'); } catch {}
  }
  try { const tmp = '/tmp/codex-cmux'; if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true }); } catch {}

  p.outro(pc.green('cmux-codex has been uninstalled.'));
}

export async function test(): Promise<void> {
  p.intro(pc.bgMagenta(pc.white(' cmux-codex test ')));

  if (!existsSync(HANDLER_DEST)) { p.cancel('Handler not installed. Run "cmux-codex setup" first.'); return; }
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
