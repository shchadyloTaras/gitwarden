---
title: AI Connections
description: Add an AI provider to get commit message help, change review, and a built-in chat panel.
order: 7
---

# AI Connections

GitWarden includes an optional AI assistant for commit messages, code review, push summaries, and a general-purpose chat. The AI features are **advisory only** — the assistant never runs Git commands, never modifies files, and never sends data without your explicit action.

## Supported providers

| Provider                        | What you need                          |
| ------------------------------- | -------------------------------------- |
| OpenAI (GPT-4o, GPT-4, GPT-3.5) | An OpenAI API key                      |
| Anthropic (Claude)              | An Anthropic API key                   |
| Ollama (local models)           | Ollama running locally on your machine |
| Custom HTTP endpoint            | Any OpenAI-compatible API              |

## Adding a connection

1. Open **Settings → AI Connections**
2. Click **Add Connection**
3. Choose your provider from the list
4. Paste your API key (or enter the Ollama base URL for local models)
5. Click **Save** — the key is stored encrypted in the OS keychain

The API key is never logged and never sent anywhere except the provider's own API endpoint.

## What the AI assistant can do

**Smart Commit** — suggests a commit message based on your staged diff. Trigger it with `/commit` in the chat panel or the "Generate message" button in the Commit screen.

**Change Review** — writes a pull-request-style summary of your staged changes. Trigger with `/review`.

**Safety Copilot** — explains safety warnings in plain English and suggests how to resolve them. Appears automatically in the Safety Center when a check fails.

**Push Brief** — summarises what will be pushed and why. Trigger with `/push-brief`.

**Chat** — a general-purpose panel for questions about the repository, Git help, or anything else. Open it with the panel toggle in the right sidebar.

## What data is sent to the AI

GitWarden sends only what is needed for the specific request:

| Feature        | What is sent                                     |
| -------------- | ------------------------------------------------ |
| Commit message | Staged diff (secrets stripped), repository name  |
| Change review  | Staged diff (secrets stripped)                   |
| Safety Copilot | Failing check description only — no file content |
| Chat           | Only what you type                               |

Sensitive values — tokens, passwords, private keys — are stripped from diffs before anything is sent.

## Agentic proposals

Some AI responses include proposed file edits — for example, a suggested fix for a config issue flagged by the Safety Copilot. These are **always shown as a preview** first. Nothing is written to disk without your explicit approval. The assistant cannot run Git commands or push code under any circumstances.
