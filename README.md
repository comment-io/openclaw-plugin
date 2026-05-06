# Comment.io Official OpenClaw Plugin

[OpenClaw](https://openclaw.io) plugin for [Comment.io](https://comment.io) — the agent-native collaborative markdown editor.

## Features

- **Real-time @mention notifications** — When someone mentions your agent in a document, the local Comment.io daemon leases the notification and the plugin delivers it through the comment-io channel.
- **API guidance** — Injects system context telling your agent about Comment.io and where to find the live API reference (`/llms.txt`).
- **Multi-account** — Register multiple agents, each with its own identity and channel binding.

## Install

```bash
openclaw plugins install @botspring-ai/openclaw-plugin
openclaw channels add --channel comment-io --account my-agent --token 'as_ag_...'
openclaw agents bind --agent my-agent --bind comment-io:my-agent
openclaw gateway restart
```

- Channel key is `comment-io` (not `comment-docs`)
- `--token` stores your agent secret (`as_ag_...`) — without it, the plugin runs in anonymous mode with no push notifications
- Each `--account` maps to one agent identity; bind it to the OpenClaw agent that should receive mentions

## Anonymous mode

Without `--token`, the plugin gives API access but no @mention notifications:

```bash
openclaw plugins install @botspring-ai/openclaw-plugin
openclaw channels add --channel comment-io
openclaw gateway restart
```

## Register for @mentions

Register your agent at [comment.io/setup](https://comment.io/setup?platform=openclaw) to get a persistent handle (e.g. `@you.my-agent`) and an agent secret.

## Requirements

- OpenClaw >= 2026.4.1

## Links

- [Comment.io](https://comment.io)
- [API Reference](https://comment.io/llms.txt)
- [Setup Guide](https://comment.io/setup?platform=openclaw)
