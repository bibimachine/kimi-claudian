# Kimi Claudian

An Obsidian plugin that embeds **Kimi Code CLI** in your vault sidebar. Your vault becomes Kimi's working directory — file read/write, search, bash, and multi-step workflows all work out of the box.

## Origin

This project is a **Kimi-only fork** of [Claudian](https://github.com/YishenTu/claudian), originally created by [Yishen Tu](https://github.com/YishenTu). It removes the Claude / Codex / OpenCode / Pi providers and replaces them with a single provider backed by the local **Kimi Code CLI**.

## Features & Usage

Open the chat sidebar from the ribbon icon or command palette. Select text and use the hotkey for inline edit. Everything works like your familiar coding agent, powered by Kimi Code CLI.

**Inline Edit** — Select text or start at the cursor position + hotkey to edit directly in notes with word-level diff preview.

**Slash Commands & Skills** — Type `/` for reusable prompt templates and skills.

**`@mention`** — Type `@` to mention vault files, subagents, MCP servers, or external directories.

**Plan Mode** — Toggle via `Shift+Tab`. Kimi explores and designs before implementing, then presents a plan for approval.

**Instruction Mode (`#`)** — Refined custom instructions added from the chat input.

**MCP Servers** — Connect external tools via Model Context Protocol (stdio, SSE, HTTP) through Kimi Code CLI's MCP support.

**Multi-Tab & Conversations** — Multiple chat tabs, conversation history, resume, and compact.

## Requirements

- **[Kimi Code CLI](https://platform.kimi.ai/docs/guide/claude-code-kimi)** installed and available on your PATH as `kimi`.
- Obsidian v1.7.2+
- Desktop only (macOS, Linux, Windows)

## Installation

### Manual installation from build artifacts

Use this if you already have `main.js`, `styles.css`, and `manifest.json` (for example after running `npm run build`).

1. Build the plugin (skip this if you already have the three files):
   ```bash
   npm run build
   ```

2. In your vault, create the plugin directory:
   ```text
   .obsidian/plugins/kimi-claudian/
   ```

   > The folder name can be anything, but we recommend using `kimi-claudian` to match the plugin ID. If you previously used `.obsidian/plugins/realclaudian` for Claudian, you can reuse that folder name; Obsidian reads the plugin ID from `manifest.json`.

3. Copy the three build artifacts into that directory:
   ```bash
   cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/kimi-claudian/
   ```

4. Enable the plugin in Obsidian:
   - Open **Settings → Community plugins**
   - Turn off **Safe mode** if it is on
   - Find **Kimi Claudian** and click **Enable**

### From source (development)

1. Clone this repository into your vault's plugins folder:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone <repo-url> kimi-claudian
   cd kimi-claudian
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Enable the plugin in Obsidian:
   - Settings → Community plugins → Enable "Kimi Claudian"

### Development

```bash
# Watch mode
npm run dev

# Production build
npm run build
```

## Privacy & Data Use

- **Sent to API**: Your input, attached files, images, and tool call outputs via Kimi Code CLI and your configured Kimi provider.
- **Local storage**: Kimi Claudian settings and session metadata in `vault/.claudian/`; Kimi native sessions in `~/.kimi/sessions/`.
- **Environment variables**: Kimi subprocesses inherit the Obsidian process environment plus any variables you configure in Kimi Claudian settings.

## Troubleshooting

### Kimi CLI not found

If you encounter `spawn kimi ENOENT`, the plugin can't find the Kimi Code CLI.

**Solution**: Find your CLI path with `which kimi` and set it in Settings → Advanced → Kimi CLI path. Leave it empty first to try auto-detection from PATH.

## License

Licensed under the [MIT License](LICENSE).
