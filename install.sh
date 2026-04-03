#!/bin/bash
# codex-cmux installer
# works on macOS and Linux, local and remote (SSH) machines.
# on machines without cmux, the handler simply no-ops (exits 0 silently).
set -e

INSTALL_DIR="$HOME/.codex-cmux"
CODEX_DIR="$HOME/.codex"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  codex-cmux"
echo "  =========="
echo ""

# ---- Prerequisites ----

# Verify node 20+
if ! command -v node &>/dev/null; then
  echo "  [!!] node not found. codex-cmux requires Node.js 20+."
  exit 1
fi

NODE_VERSION=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "  [!!] Node.js v$NODE_VERSION detected, need 20+."
  exit 1
fi
echo "  [ok] node v$(node -e 'process.stdout.write(process.versions.node)')"

# ---- Copy handler ----

mkdir -p "$INSTALL_DIR"

if [ -f "$SCRIPT_DIR/dist/handler.cjs" ]; then
  cp "$SCRIPT_DIR/dist/handler.cjs" "$INSTALL_DIR/handler.cjs"
  echo "  [ok] handler copied to $INSTALL_DIR/"
else
  echo "  [!!] dist/handler.cjs not found. run 'npm run build' first."
  exit 1
fi

# ---- Create default config ----

if [ ! -f "$INSTALL_DIR/config.json" ]; then
  cat > "$INSTALL_DIR/config.json" << 'CONF'
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
CONF
  echo "  [ok] default config created"
else
  echo "  [ok] existing config preserved"
fi

# ---- Test handler ----

echo '{}' | node "$INSTALL_DIR/handler.cjs" 2>/dev/null
if [ $? -eq 0 ]; then
  echo "  [ok] handler verified (clean exit)"
else
  echo "  [!!] handler test failed"
  exit 1
fi

# ---- Critical test: Stop produces NO stdout ----

STOP_OUTPUT=$(echo '{"hook_event_name":"Stop","session_id":"t","turn_id":"t","stop_hook_active":false,"last_assistant_message":"test","model":"test","cwd":"/tmp","transcript_path":null}' | node "$INSTALL_DIR/handler.cjs" 2>/dev/null)
if [ -z "$STOP_OUTPUT" ]; then
  echo "  [ok] stop handler is silent (critical for codex)"
else
  echo "  [!!] stop handler produced stdout — codex would misinterpret this!"
  exit 1
fi

# ---- Enable codex hooks in config.toml ----

mkdir -p "$CODEX_DIR"
TOML="$CODEX_DIR/config.toml"

if [ -f "$TOML" ] && grep -q "^codex_hooks.*=.*true" "$TOML" 2>/dev/null; then
  echo "  [ok] codex_hooks already enabled in config.toml"
elif [ -f "$TOML" ] && grep -q "^codex_hooks.*=.*false" "$TOML" 2>/dev/null; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's/^codex_hooks.*=.*false/codex_hooks = true/' "$TOML"
  else
    sed -i 's/^codex_hooks.*=.*false/codex_hooks = true/' "$TOML"
  fi
  echo "  [ok] flipped codex_hooks to true in config.toml"
elif [ -f "$TOML" ] && grep -q "^\[features\]" "$TOML" 2>/dev/null; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' '/^\[features\]/a\
codex_hooks = true' "$TOML"
  else
    sed -i '/^\[features\]/a codex_hooks = true' "$TOML"
  fi
  echo "  [ok] added codex_hooks = true to [features] section"
else
  printf '\n[features]\ncodex_hooks = true\n' >> "$TOML"
  echo "  [ok] created [features] section with codex_hooks = true"
fi

# ---- Check cmux socket ----

if [ -n "$CMUX_SOCKET_PATH" ] && [ -S "$CMUX_SOCKET_PATH" ]; then
  echo "  [ok] cmux socket connected"
else
  echo "  [--] cmux not detected — handler will no-op (safe for remote)"
fi

# ---- Write hooks.json ----

HOOKS_FILE="$CODEX_DIR/hooks.json"
HANDLER_CMD="node ~/.codex-cmux/handler.cjs"

write_hooks() {
  python3 -c "
import json, os, shutil

hooks_path = os.path.expanduser('$HOOKS_FILE')

# Read existing or start fresh
if os.path.exists(hooks_path):
    shutil.copy2(hooks_path, hooks_path + '.codex-cmux-backup')
    with open(hooks_path) as f:
        data = json.load(f)
else:
    os.makedirs(os.path.dirname(hooks_path), exist_ok=True)
    data = {}

handler = '$HANDLER_CMD'
hook_entry = {'type': 'command', 'command': handler, 'timeout': 10}

new_hooks = {
    'SessionStart': [{'matcher': 'startup|resume|clear', 'hooks': [hook_entry]}],
    'PreToolUse':   [{'matcher': 'Bash', 'hooks': [hook_entry]}],
    'PostToolUse':  [{'matcher': 'Bash', 'hooks': [hook_entry]}],
    'UserPromptSubmit': [{'hooks': [hook_entry]}],
    'Stop':         [{'hooks': [hook_entry]}],
}

existing = data.get('hooks', {})
added = 0

for event, entries in new_hooks.items():
    if event in existing:
        # Remove old codex-cmux entries, keep user entries
        user_entries = [e for e in existing[event]
                       if not any(h.get('command', '').find('codex-cmux') >= 0
                                  for h in e.get('hooks', []))]
        existing[event] = user_entries + entries
    else:
        existing[event] = entries
    added += 1

data['hooks'] = existing

with open(hooks_path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')

print(f'  [ok] {added} hook events written to hooks.json')
if os.path.exists(hooks_path + '.codex-cmux-backup'):
    print(f'       backup at {hooks_path}.codex-cmux-backup')
" 2>&1
}

write_hooks

# ---- Summary ----

echo ""
echo "  installed:"
echo "    ~/.codex-cmux/handler.cjs  ($(wc -c < "$INSTALL_DIR/handler.cjs" | tr -d ' ') bytes)"
echo "    ~/.codex-cmux/config.json"
echo "    ~/.codex/hooks.json        (5 hook events)"
echo "    ~/.codex/config.toml       (codex_hooks = true)"
echo ""
echo "  restart codex to activate."
echo ""
