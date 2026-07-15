# Kimi Claudian

[![GitHub release](https://img.shields.io/github/v/release/bibimachine/kimi-claudian?logo=github)](https://github.com/bibimachine/kimi-claudian/releases)
[![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=nodedotjs)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.7+-7C3AED?logo=obsidian)](https://obsidian.md/)
[![License](https://img.shields.io/github/license/bibimachine/kimi-claudian)](LICENSE)

An Obsidian plugin that embeds **[Kimi Code CLI](https://platform.kimi.ai/docs/guide/claude-code-kimi)** in your vault sidebar. Your vault becomes Kimi's working directory — file read/write, search, bash commands, and multi-step workflows all work out of the box.

## Origin

This project is a **Kimi-only fork** of [Claudian](https://github.com/YishenTu/claudian), originally created by [Yishen Tu](https://github.com/YishenTu). It removes the Claude / Codex / OpenCode / Pi providers and replaces them with a single provider backed by the local **Kimi Code CLI**.

## Requirements

- **[Kimi Code CLI](https://platform.kimi.ai/docs/guide/claude-code-kimi)** installed and available on your PATH as `kimi`.
- Obsidian v1.7.2+
- Desktop only (macOS, Linux, Windows)

## Installation

### From GitHub Release (recommended)

1. Download the latest `kimi-claudian.zip` from [GitHub Releases](https://github.com/bibimachine/kimi-claudian/releases).
2. Extract it into your vault's plugin folder:
   ```text
   .obsidian/plugins/kimi-claudian/
   ```
3. In Obsidian, go to **Settings → Community plugins**, turn off **Safe mode**, and enable **Kimi Claudian**.

### From source

```bash
npm install
npm run build
```

Then copy the generated `dist/kimi-claudian/` folder to `.obsidian/plugins/kimi-claudian/`.

## Usage

Open the chat sidebar from the ribbon icon. Select text and use the inline-edit hotkey to edit notes with a word-level diff preview. Kimi uses your vault as its working directory.

## Changelog

### v1.3.0 — WeChat Bot integration

- Added a **WeChat Bot** backend channel via Tencent's official iLink protocol (`ilinkai.weixin.qq.com`).
- QR-code login inside Obsidian settings; no unofficial/wechat-hook needed.
- Incoming WeChat messages are routed through **Kimi Chat Runtime** and replied to automatically.
- Per-contact conversation history is persisted in `.claudian/wechat-bot/` and mirrored into the Claudian conversation list for search/review.
- New **WeChat conversation panel** in the Claudian sidebar (message-circle button) to view contacts and message history in real time.
- Network diagnostics and Node `https`-based transport to work around Electron fetch/DNS issues on Windows.

## License

Licensed under the [MIT License](LICENSE).
