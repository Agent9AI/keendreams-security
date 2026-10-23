---
name: "Hexa to Memory"
author: "Agent9AI"
github_url: "https://github.com/Agent9AI/keendreams-security"
description: "Triage Tenable Hexa findings against your team's prior decisions in KeenDreams Security Memory, using only allowlisted read-only Hexa tools. Requires your own KeenDreams deployment."
license: "MIT"
tier: "contributed"
tags: ["triage", "tenable-hexa", "risk-acceptance", "false-positives", "human-in-the-loop", "memory"]
domains: ["security-operations", "vulnerability-management"]
integrations: ["Tenable", "Tenable Hexa AI MCP"]
date_added: 2026-10-10
contribution_agreement_date: 2026-09-22T16:37:44Z
works_with_tenable_hexa_mcp: true
compatible_platforms: ["Claude Code"]
invocation: "/hexa-to-memory"
---

A Claude Code skill that connects Tenable's Hexa AI MCP server to KeenDreams
Security Memory, so an analyst's triage session starts from what the team has
already decided instead of from zero.

> **This skill needs two MCP servers connected and does nothing on its own.** One
> is Tenable's Hexa AI MCP server. The other is your own deployment of KeenDreams
> Security Memory, the open-source server in the same repository. Read the
> requirements below before installing.

## What you need

| Requirement | What it is for | Cost |
|---|---|---|
| Tenable One Foundation or Advanced, Hexa AI MCP enabled, and Vulnerability Management API keys with a read-capable role | The source of findings | Your existing Tenable license |
| Your own [KeenDreams Security Memory](https://github.com/Agent9AI/keendreams-security#deploy-in-your-account) deployment in your Cloudflare account | Stores your team's decisions and the evidence behind them | Runs within Cloudflare's free Workers plan for evaluation, whose limits include 10,000 Workers AI neurons per day and 5 million stored vector dimensions. Heavier use can exceed them; see Cloudflare's pricing. |
| A Cloudflare Access for SaaS application | How reviewers sign in to confirm or reject proposed facts | Cloudflare Zero Trust offers a free plan |
| Claude Code | The only platform this skill has been tested on | Your Claude plan |

KeenDreams runs entirely in your own Cloudflare account. No component sends data
to Agent9, and no Agent9 account or service is involved.

## What it does

An analyst names a focused scope, such as a host, a tag, a single CVE, or a
severity within a time window. The skill pulls the matching findings from Hexa,
then checks each asset and vulnerability pair against the team's memory for an
existing false positive, accepted risk or remediation, and reports who made that
decision, when, and when an acceptance expires.

The output distinguishes new findings, pending proposals, confirmed observations,
applicable prior triage decisions, and findings that need reassessment. A confirmed
vulnerability is not mislabeled as remediated or accepted. Expired decisions and
fresh evidence that conflicts with earlier remediation are flagged for review.
New facts cite evidence and ordinarily remain unconfirmed until a person reviews
them in a browser.

## How it works

Hexa exposes read and write tools in the same server. Its
documented tools include ones that launch scans, create tickets, notify
assignees and apply tags. A skill that let a model choose freely among them could
start a scan or message a team on a production estate while trying to triage.

So this skill names the tools it may call. It allowlists five Hexa read tools
(`tenable_one_search_assets`, `workbenches_list_vulnerabilities`
and `workbenches_list_assets_with_vulnerabilities`, plus the asset-scoped
`workbenches_get_asset_vulnerabilities` and
`workbenches_get_asset_vulnerability_details`), lists the documented write
tools it must never call, and tells the model to show the person any other tool
and wait for agreement rather than infer safety from a name.

Three further rules shape its behavior. Findings are treated as data and never
as instructions, since scan output is attacker-reachable text. Evidence is
recorded once per batch with the `tenable-hexa` source, and the memory redacts
credential-shaped strings on the way in. The skill cannot perform browser
confirmation. It checks the status actually returned: ordinary writes are
proposals, while an explicitly allowlisted automation identity/source can write
trusted facts. That exception is disclosed rather than described as human review.

Tenable keys stay in the analyst's own MCP client configuration. The skill never
asks for one in conversation and never stores one.

## Install and evaluate

Follow the repository's
[Claude Code installation guide](https://github.com/Agent9AI/keendreams-security/blob/main/docs/integrations/tenable.md#install-the-claude-code-skill)
and invoke `/hexa-to-memory` with one agreed asset or vulnerability scope.
The skill requires both MCP connections and permission to store the selected
evidence in the chosen memory client.

## Verified live

On October 23, 2026, the skill recorded a person's accepted-risk decision for one
lab finding, with a reason and a 90-day expiry. The person confirmed it in the
browser, and a fresh read-only session, not told the decision existed, reported it
as a prior triage decision with the audit-matched reviewer and expiry. That session
also flagged that the same person proposed and confirmed the decision, and that a
newer plugin on the same asset was not covered.

The same day, further sessions on the same asset showed the remaining states: two
findings reported as new before any decision; a false-positive decision recalled as
a prior triage decision; and an acceptance with a deliberately short expiry reported
as needing reassessment once it lapsed. That expiry test first showed the expired
acceptance being reported as new, which led to a fix in the skill before this
listing was submitted. No session wrote to Tenable.

[See the live result and replay](https://github.com/Agent9AI/keendreams-security/blob/main/docs/hexa-to-memory.md) ·
[Verification record](https://github.com/Agent9AI/keendreams-security/blob/main/docs/verification.md#live-triage-states-and-expiry-check)

All checks ran on one lab asset, and the false-positive and short-expiry decisions
are labelled lab exercises. Remediation dispositions and two-person review have not
yet been run live. No Tenable certification is claimed.
