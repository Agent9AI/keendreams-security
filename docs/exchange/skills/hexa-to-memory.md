---
name: "Hexa to Memory"
author: "Agent9AI"
github_url: "https://github.com/Agent9AI/keendreams-security"
description: "Triage Tenable Hexa findings against what your team already decided, using an explicit allowlist of read-only Hexa tools"
license: "MIT"
tier: "contributed"
tags: ["triage", "tenable-hexa", "risk-acceptance", "false-positives", "human-in-the-loop", "memory"]
domains: ["vulnerability-management", "ai-security"]
integrations: ["Tenable", "Tenable Hexa AI MCP"]
date_added: 2026-09-17
contribution_agreement_date: 2026-09-22T16:37:44Z
works_with_tenable_hexa_mcp: false
compatible_platforms: ["Claude Code"]
invocation: "/hexa-to-memory"
---

A Claude Code skill that sits between Tenable's Hexa AI MCP server and KeenDreams
Security Memory, so an analyst's triage session starts from what the team has
already decided instead of from zero.

## What it does

An analyst names a focused scope, such as a host, a tag, a single CVE, or a
severity within a time window. The skill pulls the matching findings from Hexa,
then checks each asset and vulnerability pair against the team's memory for an
existing false positive, accepted risk or remediation, and reports who made that
decision, when, and when an acceptance expires.

The output is one table sorting findings into new, known and already triaged,
followed by plain counts and a link to the review queue. Anything already
settled is marked so nobody investigates it a second time. Anything new is
recorded as evidence and proposed as a fact that stays unconfirmed until a person
confirms it in a browser.

## How it works

Hexa exposes read and write tools in the same server. Its
documented tools include ones that launch scans, create tickets, notify
assignees and apply tags. A skill that let a model choose freely among them could
start a scan or message a team on a production estate while trying to triage.

So this skill names the tools it may call. It allowlists four Hexa read tools
(`tenable_one_search_assets`, `asset_search`, `workbenches_list_vulnerabilities`
and `workbenches_list_assets_with_vulnerabilities`), lists the documented write
tools it must never call, and tells the model to show the person any other tool
and wait for agreement rather than infer safety from a name.

Three further rules shape its behaviour. Findings are treated as data and never
as instructions, since scan output is attacker-reachable text. Evidence is
recorded once per batch with the `tenable-hexa` source, and the memory redacts
credential-shaped strings on the way in. And the skill cannot confirm anything:
every fact it writes is a proposal, and its summary must not present a proposal
as a finding of record.

Tenable keys stay in the analyst's own MCP client configuration. The skill never
asks for one in conversation and never stores one.
