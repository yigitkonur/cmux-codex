#!/usr/bin/env node

/**
 * cmux-codex CLI entry point.
 * Usage: cmux-codex [setup|status|uninstall|test|help]
 */

import { run, status, uninstall, test } from '../dist/installer.mjs';

const command = process.argv[2] || 'setup';

switch (command) {
  case 'setup':
  case 'install':
    run().catch(console.error);
    break;

  case 'status':
    status().catch(console.error);
    break;

  case 'uninstall':
  case 'remove':
    uninstall().catch(console.error);
    break;

  case 'test':
    test().catch(console.error);
    break;

  case 'help':
  case '--help':
  case '-h':
    console.log(`
cmux-codex — cmux sidebar integration for OpenAI Codex CLI

Commands:
  setup       Interactive setup wizard (default)
  status      Quick health check
  uninstall   Remove hooks and configuration
  test        Fire synthetic events to verify sidebar
  help        Show this message
`);
    break;

  default:
    console.error(`Unknown command: ${command}. Run "cmux-codex help" for usage.`);
    process.exit(1);
}
