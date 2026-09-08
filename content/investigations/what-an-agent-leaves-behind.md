---
title: What an agent leaves behind
date: 2026-09-06
kind: Field note
summary: A public contribution is a useful trace. Working out who made it, what changed, and what remains unknown takes a separate layer of evidence. How this site reads each kind of trace.
sources: https://developers.openai.com/api/docs/bots | https://support.claude.com/en/articles/8896518 | https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/ | https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup | https://docs.github.com/en/rest/search/search
---

An autonomous agent does not announce itself the way a person does. It leaves a request in a server log, a revision in a wiki history, a pull request with a bot account as author, a post on a forum that describes its accounts as agents. Each of those is a real trace. None of them, on its own, says what the agent intended, who set it running, or whether anyone was watching.

This note explains how gcdTracker reads each kind of trace and what it refuses to conclude from it.

## Requests

A web request carries a user-agent string and comes from an address. The string is free text: anything can call itself GPTBot. This site can compare the source address with ranges published by the claimed operator. A match supports that network attribution; it does not identify a model or prove the request's purpose. Signature headers are recorded as **unverified presence only**: this site does not yet perform cryptographic signature verification. A claimed agent outside a published range fails the IP check; an operator with no available ranges remains unverifiable.

The vendors themselves split their agents into three kinds. Training crawlers build corpora. Search indexers build the index behind an assistant's citations. User-triggered fetchers read one page because a person just asked about it. Comparing these purposes can help distinguish broad crawling from retrieval, but a user-agent label alone does not establish why an individual request occurred.

## Edits

Wikipedia publishes revision histories and community filters for edits that may contain machine-written material. When a filter fires, the edit carries a public tag such as *possible AI-generated citations*. That tag is the community's judgement, made by rules it published, and this site stores it as **filter-flagged**. Everything else, an edit summary that mentions ChatGPT, a username that reads like a script, is a **heuristic** and is labelled as one.

Wikidata and the other Wikimedia projects add a second layer: registered bots, mostly classic scripts, edit at a rate that dwarfs everything else. Those counts are shown as automation volume, not as AI.

## Pull requests

GitHub records the author of every pull request. Coding agents that run as GitHub apps get a bot account with a stable numeric id, and a PR from that id provides evidence about the account that submitted it. Some agents push under the person's own account instead; for those, a branch prefix such as `codex/` is a fingerprint, distinctive but not proof. A footer that says *Generated with Claude Code* is a self-disclosure: the person said a tool helped. It does not say the tool acted alone, and this site never counts it as if it did until someone reviews it.

## Posts

A platform may describe its accounts as AI agents, but its rules do not independently verify who produced every post. These records are labelled **platform-reported**. They can reveal posting patterns and topics; human participation, account control and model identity remain uncertain.

## What stays unknown

None of these traces reveals the prompt, the operator, or the model. An IP-matched request from a catalogued user-fetcher supports an operator attribution and declared purpose; it does not expose the trigger or prompt. A documented bot-account pull request identifies the submitting account; it does not establish how much code a model wrote or whether the change was reviewed. The confidence ladder on the Methods page exists so that every number on this site can be traced back to which of these traces produced it.
