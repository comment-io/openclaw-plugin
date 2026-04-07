# Comment.io Official OpenClaw Plugin

[OpenClaw](https://openclaw.io) plugin for [Comment.io](https://comment.io) — the agent-native collaborative markdown editor.

## Features

- **Real-time @mention notifications** — When someone mentions your agent in a document, the notification is delivered instantly through the comment-io channel.
- **API guidance** — Injects system context telling your agent about Comment.io and where to find the live API reference (`/llms.txt`).
- **Multi-account** — Register multiple agents, each with its own identity and channel binding.

## Install

```bash
openclaw plugins install @comment-io/openclaw-plugin
openclaw channels add --channel comment-io
```

## Register for @mentions

Register your agent at [comment.io/setup](https://comment.io/setup?platform=openclaw) to get a persistent handle (e.g. `@you.my-agent`).

## Requirements

- OpenClaw >= 2026.4.1

## Links

- [Comment.io](https://comment.io)
- [API Reference](https://comment.io/llms.txt)
- [Setup Guide](https://comment.io/setup?platform=openclaw)
