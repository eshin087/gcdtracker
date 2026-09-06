---
title: What an agent leaves behind
date: 2026-09-06
kind: Field note
summary: A public contribution is a useful trace. Working out who made it, what changed, and what remains unknown takes a separate layer of evidence. How this site reads each kind of trace.
sources: https://developers.openai.com/api/docs/bots | https://support.claude.com/en/articles/8896518 | https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/ | https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup | https://docs.github.com/en/rest/search/search
---

An autonomous agent does not announce itself the way a person does. It leaves a request in a server log, a revision in a wiki history, a pull request with a bot account as author, a post on a forum where people cannot post. Each of those is a real trace. None of them, on its own, says what the agent intended, who set it running, or whether anyone was watching.

This note explains how gcdTracker reads each kind of trace and what it refuses to conclude from it.

## Requests

A web request carries a user-agent string and comes from an address. The string is free text: anything can call itself GPTBot. What makes a request evidence is the combination of a name and an address inside the ranges the operator publishes, or a cryptographic signature under the Web Bot Auth standard. This site records both checks. A request that names an agent but fails the address check is stored as **unverified**, and the tables say so.

The vendors themselves split their agents into three kinds. Training crawlers build corpora. Search indexers build the index behind an assistant's citations. User-triggered fetchers read one page because a person just asked about it. The third kind grew more than fifteen times during 2025 and matters most to anyone asking whether AI is replacing visits from people.

## Edits

Wikipedia keeps the fullest public record of edits on the internet, and since 2025 it runs its own filters for text that looks machine-written. When a filter fires, the edit carries a public tag such as *possible AI-generated citations*. That tag is the community's judgement, made by rules it published, and this site stores it as **filter-flagged**. Everything else, an edit summary that mentions ChatGPT, a username that reads like a script, is a **heuristic** and is labelled as one.

Wikidata and the other Wikimedia projects add a second layer: registered bots, mostly classic scripts, edit at a rate that dwarfs everything else. Those counts are shown as automation volume, not as AI.

## Pull requests

GitHub records the author of every pull request. Coding agents that run as GitHub apps get a bot account with a stable numeric id, and a PR from that id is as close to certain as public data gets. Some agents push under the person's own account instead; for those, a branch prefix such as `codex/` is a fingerprint, distinctive but not proof. A footer that says *Generated with Claude Code* is a self-disclosure: the person said a tool helped. It does not say the tool acted alone, and this site never counts it as if it did until someone reviews it.

## Posts

On an agent-only network, authorship is settled by the platform's rules. It is the one place where the question "was this an AI?" has a trivial answer, and the only place where the more interesting question, "what do agents talk about when no one prompts them?", can be asked at all.

## What stays unknown

None of these traces reveals the prompt, the operator, or the model. A visit from a verified user-fetcher tells you a person asked an assistant something that led here; it does not tell you what. A confirmed agent pull request tells you a tool wrote code; it does not tell you whether the change was reviewed. The confidence ladder on the Methods page exists so that every number on this site can be traced back to which of these traces produced it.
