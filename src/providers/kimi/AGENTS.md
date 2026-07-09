# Kimi Code CLI Provider

`src/providers/kimi/` adapts Kimi Code CLI through the Agent Client Protocol over a `kimi acp` subprocess.

## Ownership

- Runtime process management, ACP transport, prompt encoding, stream normalization, JSONL history hydration, model discovery, command discovery, agent storage, settings UI, and Kimi-specific settings reconciliation live here.
- Shared code consumes Kimi behavior through `ChatRuntime`, provider capabilities, and workspace-service contracts.

## Protocol Rules

- Live output comes from ACP `session/update` notifications and is normalized through `AcpSessionUpdateNormalizer`.
- Kimi ACP method names use the `session/*` namespace: `session/new`, `session/list`, `session/load`, `session/prompt`, `session/set_mode`.
- Kimi does not implement `session/cancel`, `session/set_config_option`, or `session/request_permission`. Cancel by shutting down the subprocess; model and mode changes are applied at process spawn time.
- History hydration reads Kimi's native `context.jsonl` and `wire.jsonl` session files under `~/.kimi/sessions/{vault_hash}/{session_id}/`. Never mutate Kimi native history from Kimi Claudian.
- `providerState.sessionFile` may preserve the session file path for a conversation.

## Launch and Settings

- The chat runtime spawns `kimi acp` with the vault as the working directory.
- Model and thinking variant are controlled by Kimi's own config (`~/.kimi/config.toml`) and the `KIMI_MODEL` environment variable. Runtime model switching via ACP is not supported.
- Environment keys that affect config or data location invalidate Kimi sessions: `KIMI_CONFIG`, `KIMI_*` vars, and `XDG_DATA_HOME`.

## Commands and Agents

- Runtime commands are read from the Kimi session `available_commands_update` notification and exposed through `KimiCommandCatalog`.
- Agent definitions are stored under `.kimi/agent` and `.kimi/agents`.

## Gotchas

- `KimiAuxQueryRunner` owns its own process and session for inline edit, title generation, and instruction refinement.
- The default model reported by Kimi ACP is `kimi-code/kimi-for-coding`; the thinking variant is `kimi-code/kimi-for-coding,thinking`.
