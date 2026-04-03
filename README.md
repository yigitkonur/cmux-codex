# codex-cmux

real-time cmux sidebar integration for OpenAI Codex CLI. status pills, progress bars, bash command logs, focus-aware desktop notifications, git integration — all wired through codex's 5 hook events and cmux's unix socket.

sibling project to [cmux-claude-pro](https://github.com/yigitkonur/cmux-claude-pro) (16 hooks for Claude Code). same architecture, adapted for codex's simpler hook system.

![status](https://img.shields.io/badge/status-production--ready-brightgreen) ![hooks](https://img.shields.io/badge/hooks-5%20events-blue) ![latency](https://img.shields.io/badge/socket%20latency-~8ms-yellow) ![node](https://img.shields.io/badge/node-20%2B-green) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

## the sidebar, explained

### status pill (top of sidebar)

| state | icon | color | when it appears |
|---|---|---|---|
| `Ready` | checkmark.circle | green | session started, waiting for input |
| `Thinking...` | brain | gold | you submitted a prompt, codex is processing |
| `Working: Bash: npm test` | hammer.fill | blue | codex is running a command |
| `Done` | checkmark.seal | green | response complete |
| `Error` | xmark.circle | red | response failed |

### progress bar

adaptive estimation using `n/(n+K)` where K learns from your session history:

```
1 tool  → ████░░░░░░░░░░░░░░░░  0.09
3 tools → ██████████░░░░░░░░░░  0.23
5 tools → ████████████░░░░░░░░  0.33
done    → ████████████████████  1.00 Complete
```

caps at 0.95 during work. never hits 100% until codex actually finishes.

### sidebar log entries

every bash command gets a formatted log entry:

```
[codex] [info] Bash: `npm test -- --coverage` → exit 0
[codex] [info] Bash: `git diff --stat` → exit 0
[codex] [info] Bash: `ls -la src/` → exit 0
```

when codex adds Edit/Read/Grep tool hooks, those will log automatically too (future-proofed with a default passthrough).

### desktop notifications

focus-aware — only fires when you're NOT looking at the codex tab:

| trigger | notification |
|---|---|
| codex finishes | "Codex / Done / Fixed the auth bug by..." |
| error occurs | "Codex / Error / Response failed" |

### metadata

| element | source |
|---|---|
| git branch | `main` via `report_git_branch` (+ dirty indicator) |
| ssh host | `user@server (ssh)` via `report_meta` (yellow network icon) |

## all 5 hook events

every codex lifecycle event we handle:

| hook event | when it fires | what we do |
|---|---|---|
| `SessionStart` | session begins (startup/resume/clear) | set Ready, register PID, detect git, clean stale sessions |
| `UserPromptSubmit` | you hit enter | set Thinking, clear progress, clear notifications |
| `PreToolUse` | before bash runs | set Working with command, increment progress |
| `PostToolUse` | after bash completes | log command + exit code, refresh git on git commands |
| `Stop` | codex finishes responding | set Done, complete progress, focus-aware notification |

### what codex doesn't have (vs claude code)

codex's hook system is simpler. these claude code features have no codex equivalent:

| missing | why | workaround |
|---|---|---|
| SessionEnd | no hook | ppid liveness detection cleans up dead sessions |
| PermissionRequest | no hook | no "Waiting" status (codex handles permissions internally) |
| SubagentStart/Stop | no hook | no agent count tracking |
| PreCompact/PostCompact | no compaction | — |
| Edit/Read/Grep in logs | only Bash fires | logs bash commands only |
| StopFailure | no hook | no distinct error notification |

## install

### one-liner (macOS & Linux)

```bash
cd /tmp \
  && git clone https://github.com/yigitkonur/codex-cmux.git \
  && cd codex-cmux \
  && npm install && npm run build \
  && bash install.sh
```

the installer automatically:
- copies handler to `~/.codex-cmux/`
- enables `codex_hooks = true` in `~/.codex/config.toml`
- writes 5 hook events to `~/.codex/hooks.json` (preserving existing hooks)
- creates a backup at `hooks.json.codex-cmux-backup`
- verifies handler loads and Stop is silent
- works on macOS (BSD sed) and Linux (GNU sed)

### step by step

```bash
# 1. clone
git clone https://github.com/yigitkonur/codex-cmux.git
cd codex-cmux

# 2. build (needs node 20+)
npm install
npm run build

# 3. install
bash install.sh

# 4. restart codex
```

### interactive installer (alternative)

```bash
npx codex-cmux setup
```

TUI wizard with feature selection, SSH setup, and remote deployment.

## hook configuration

the installer handles this automatically. for manual setup, create `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [{"matcher": "startup|resume|clear", "hooks": [{"type": "command", "command": "node ~/.codex-cmux/handler.cjs", "timeout": 10}]}],
    "PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "node ~/.codex-cmux/handler.cjs", "timeout": 10}]}],
    "PostToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "node ~/.codex-cmux/handler.cjs", "timeout": 10}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "node ~/.codex-cmux/handler.cjs", "timeout": 10}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "node ~/.codex-cmux/handler.cjs", "timeout": 10}]}]
  }
}
```

and enable hooks in `~/.codex/config.toml`:

```toml
[features]
codex_hooks = true
```

restart codex after adding hooks.

## try it yourself

paste this into a fresh codex session:

```
run this test step by step. wait 2 seconds between each step and announce each step number.

step 1 — run: echo "hello from codex-cmux sidebar test"
step 2 — run: ls -la /tmp/
step 3 — run: echo "step 3 done" && date
step 4 — run: git status 2>/dev/null || echo "not a git repo"
step 5 — run: echo "all 5 steps complete — check your cmux sidebar!"
```

### what you'll see

| step | status pill | progress | sidebar log |
|---|---|---|---|
| start | `Ready` (green) | — | — |
| prompt | `Thinking...` (gold) | cleared | — |
| 1 | `Working: Bash: echo "hello…` | `0.09 1 tool` | `Bash: \`echo "hello…\` → exit 0` |
| 2 | `Working: Bash: ls -la /tmp/` | `0.17 2 tools` | `Bash: \`ls -la /tmp/\` → exit 0` |
| 3 | `Working: Bash: echo "step …` | `0.23 3 tools` | `Bash: \`echo "step 3 done" …\` → exit 0` |
| 4 | `Working: Bash: git status` | `0.29 4 tools` | `Bash: \`git status\` → exit 0` |
| 5 | `Working: Bash: echo "all 5…` | `0.33 5 tools` | `Bash: \`echo "all 5 steps…\` → exit 0` |
| done | `Done` (green) | `1.00 Complete` | — |

## configuration

`~/.codex-cmux/config.json`:

```json
{
  "features": {
    "statusPills": true,
    "progress": true,
    "logs": true,
    "notifications": true,
    "gitIntegration": true
  },
  "notifications": {
    "onStop": true,
    "onError": true
  }
}
```

## coexistence with cmux-claude-pro

both can run in the same cmux workspace simultaneously:

| | codex-cmux | cmux-claude-pro |
|---|---|---|
| status key | `codex` | `claude_code` |
| temp dir | `/tmp/codex-cmux/` | `/tmp/cc-cmux/` |
| config dir | `~/.codex-cmux/` | `~/.cc-cmux/` |
| hooks file | `~/.codex/hooks.json` | `~/.claude/settings.json` |

each gets its own status pill, progress bar, and log entries in the sidebar.

## ssh / remote machines

when you ssh into a remote machine and run codex there, codex-cmux updates **your local sidebar** with the remote session's status.

### how it works

```
local cmux sidebar ← unix socket ← SSH -R tunnel ← remote handler ← codex hooks
```

### setup

**local machine** — add to `~/.zshrc`:
```bash
if [ -S "$CMUX_SOCKET_PATH" ]; then
  ln -sf "$CMUX_SOCKET_PATH" /tmp/cmux-local.sock 2>/dev/null
fi
```

**local machine** — add to `~/.ssh/config`:
```
Host myserver
  RemoteForward /tmp/cmux-fwd.sock /tmp/cmux-local.sock
  SendEnv CMUX_WORKSPACE_ID CMUX_SURFACE_ID CMUX_TAB_ID CMUX_PANEL_ID
```

**remote machine:**
```bash
# accept env vars + allow socket reuse
echo "AcceptEnv CMUX_WORKSPACE_ID CMUX_SURFACE_ID CMUX_TAB_ID CMUX_PANEL_ID" | sudo tee -a /etc/ssh/sshd_config
echo "StreamLocalBindUnlink yes" | sudo tee -a /etc/ssh/sshd_config
sudo systemctl restart sshd  # Linux
# or: sudo launchctl kickstart -k system/com.openssh.sshd  # macOS

# deploy handler
scp ~/.codex-cmux/handler.cjs myserver:~/.codex-cmux/

# add to remote ~/.zshrc:
if [ -S /tmp/cmux-fwd.sock ] && [ -n "$SSH_CONNECTION" ]; then
  export CMUX_SOCKET_PATH=/tmp/cmux-fwd.sock
  [ -z "$CMUX_WORKSPACE_ID" ] && [ -f /tmp/cmux-fwd.env ] && . /tmp/cmux-fwd.env
fi
```

or use the interactive installer: `codex-cmux setup` handles SSH config automatically.

## how it works

a single 29KB node.js handler (`handler.cjs`) gets invoked for every hook event. reads JSON from stdin, updates cmux's sidebar via direct unix socket (~8ms per call), manages state atomically in `/tmp/codex-cmux/`.

no daemon. no background process. no runtime dependencies. just node builtins.

```
codex hook event
    → stdin JSON
    → handler.cjs (route by hook_event_name)
    → unix socket → cmux sidebar
    → atomic state file write
    → exit 0 (always, NEVER produces stdout on Stop)
```

**critical design rule:** the Stop handler MUST be completely silent. any JSON on stdout would be interpreted by codex as a "continue the turn" directive. the handler updates the sidebar and exits without writing anything.

### session cleanup without SessionEnd

codex has no SessionEnd hook. cleanup works via:

1. **ppid liveness** — on each SessionStart, scan all session state files. if the stored codex parent PID is dead (`kill(pid, 0)` → ESRCH), clear that session's sidebar and delete its state.
2. **cmux crash recovery** — `set_agent_pid` registers the PID. cmux's 30-second poller detects dead PIDs and auto-clears the status pill.
3. **age-based fallback** — state files older than 24 hours are cleaned on SessionStart.

## cmux primitives used

| primitive | what it does |
|---|---|
| `set_status` | status pill with icon + color |
| `clear_status` | cleanup |
| `set_agent_pid` | crash recovery — 30s PID polling |
| `clear_agent_pid` | cleanup |
| `set_progress` | progress bar |
| `clear_progress` | cleanup |
| `log` | sidebar activity feed |
| `clear_log` | cleanup |
| `notify_target` | workspace-targeted desktop notifications |
| `clear_notifications` | clear stale notifications |
| `report_git_branch` | git branch in sidebar |
| `report_meta` | ssh host / remote metadata |
| `clear_meta` | cleanup |
| `workspace_action` | tab unread indicators |

## architecture

```
~/.codex-cmux/
├── handler.cjs    # 29KB compiled handler (5 events)
└── config.json    # feature toggles

/tmp/codex-cmux/
└── <session-id>.json  # per-session state (atomic r/w, mkdir lock)
```

source layout:

```
src/
├── handler.ts           # entry: stdin → route → dispatch → exit 0 (5 events)
├── constants.ts         # AGENT_KEY='codex', paths, limits
├── cmux/
│   ├── socket.ts        # unix socket client (send/fire/fireAll + isFocused)
│   ├── commands.ts      # typed builders for 14 cmux primitives
│   └── helpers.ts       # fireStatus, statusCmd, notifyIfUnfocused
├── state/
│   ├── manager.ts       # atomic file state with mkdir locking + ppid detection
│   ├── types.ts         # SessionState, StatusPhase (5 phases)
│   └── progress.ts      # adaptive n/(n+K) algorithm
├── events/
│   ├── context.ts       # HandlerContext interface
│   ├── types.ts         # 5-event discriminated union
│   ├── session.ts       # SessionStart + stale ppid cleanup
│   ├── tools.ts         # PreToolUse + PostToolUse (Bash)
│   └── flow.ts          # UserPromptSubmit + Stop (silent)
├── features/
│   ├── status.ts        # 5-state priority system
│   ├── logger.ts        # bash command log formatting
│   └── git.ts           # branch detection, PR extraction
├── config/              # types, loader, defaults
├── installer/           # TUI wizard, TOML editor, hooks.json merge
└── util/                # env detection, stdin reader
```

## uninstall

```bash
# 1. remove hooks from hooks.json (keeps your other hooks)
python3 -c "
import json, os
p = os.path.expanduser('~/.codex/hooks.json')
if not os.path.exists(p): exit()
d = json.load(open(p))
for event in list(d.get('hooks', {})):
    d['hooks'][event] = [e for e in d['hooks'][event]
                         if not any('codex-cmux' in h.get('command','')
                                    for h in e.get('hooks', []))]
    if not d['hooks'][event]: del d['hooks'][event]
json.dump(d, open(p, 'w'), indent=2)
print('removed codex-cmux hooks')
"

# 2. remove handler files
rm -rf ~/.codex-cmux/

# 3. restart codex
```

or use the interactive uninstaller: `codex-cmux uninstall`

## troubleshooting

| symptom | cause | fix |
|---|---|---|
| no sidebar panel | cmux not active | check `echo $CMUX_SOCKET_PATH` |
| hooks not firing | feature flag off | check `~/.codex/config.toml` has `codex_hooks = true` |
| sidebar stuck on Working | codex crashed without SessionEnd | next SessionStart cleans up via ppid check |
| no notifications | focus-aware | only fires when you're in a different tab |
| handler crashes | node too old | need Node.js 20+ |
| sidebar doesn't update | stale handler | `cp dist/handler.cjs ~/.codex-cmux/` and restart codex |

## license

MIT
