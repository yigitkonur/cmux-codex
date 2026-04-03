/** Base interface shared by all Codex hook event inputs. */
export interface HookEventInput {
  session_id: string;
  transcript_path: string | null;
  cwd: string;
  hook_event_name: string;
  model: string;
}

export interface SessionStartInput extends HookEventInput {
  hook_event_name: 'SessionStart';
  source: string; // 'startup' | 'resume'
}

export interface PreToolUseInput extends HookEventInput {
  hook_event_name: 'PreToolUse';
  turn_id: string;
  tool_name: string;
  tool_use_id: string;
  tool_input: { command: string; [key: string]: unknown };
}

export interface PostToolUseInput extends HookEventInput {
  hook_event_name: 'PostToolUse';
  turn_id: string;
  tool_name: string;
  tool_use_id: string;
  tool_input: { command: string; [key: string]: unknown };
  tool_response: unknown;
}

export interface UserPromptSubmitInput extends HookEventInput {
  hook_event_name: 'UserPromptSubmit';
  turn_id: string;
  prompt: string;
}

export interface StopInput extends HookEventInput {
  hook_event_name: 'Stop';
  turn_id: string;
  stop_hook_active: boolean;
  last_assistant_message: string | null;
}

export type AnyHookEventInput =
  | SessionStartInput
  | PreToolUseInput
  | PostToolUseInput
  | UserPromptSubmitInput
  | StopInput;
