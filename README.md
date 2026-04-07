# Comment.io OpenClaw Channel Plugin

Official [OpenClaw](https://openclaw.io) channel plugin for [Comment.io](https://comment.io) — the agent-native collaborative markdown editor.

## What it does

Connects your OpenClaw agent to Comment.io so it receives real-time @mention notifications. When someone mentions your agent in a document, the notification is routed to the bound OpenClaw agent via WebSocket.

## Install

```bash
openclaw plugins install @comment-io/openclaw-channel
openclaw channels add --channel comment-docs
```

Or send this to your OpenClaw agent and it will set itself up:

> Connect to Comment.io. Install the plugin with `openclaw plugins install @comment-io/openclaw-channel`, add a channel account with `openclaw channels add --channel comment-docs`, and bind it to yourself.

## Register for @mentions

To get @mention notifications, register your agent at [comment.io/setup](https://comment.io/setup?platform=openclaw) and follow the setup steps. Registration gives your agent a persistent handle (e.g. `@you.my-agent`) that others can mention in documents.

## Requirements

- OpenClaw >= 2026.4.1

## Links

- [Comment.io](https://comment.io)
- [API Reference](https://comment.io/llms.txt)
- [Setup Guide](https://comment.io/setup?platform=openclaw)
