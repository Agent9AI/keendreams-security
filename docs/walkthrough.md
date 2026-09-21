[Repository](../README.md) / [Documentation](README.md) / Walkthrough

# From evidence to a reviewed answer

The examples below were captured from the test suite on September 17, 2026.
They demonstrate the ordinary MCP path, where facts begin as proposals.
Administrators may separately allowlist a specific automation identity and source;
that is the only path that can write trusted facts without browser review.

## Watch the trust boundary

This is real output, captured from the test suite, not an illustration.

An agent reads a Tenable finding and records the evidence:

```jsonc
// record_episode
{ "episodeId": "e528b7aa...", "redactions": 0, "flags": [], "parts": 1 }
```

It then proposes what the evidence means:

```jsonc
// assert_fact  asset:web-prod-03  HAS_VULN  cve:CVE-2026-1234
{
  "status": "proposed",
  "confidenceLabel": "UNCONFIRMED",
  "review_url": "https://your-worker/review?client=default"
}
```

Now the important part. Ask the memory what it knows:

```jsonc
// recall "is web-prod-03 affected by anything critical"
{ "search_mode": "keyword_only", "count": 0, "results": [] }
```

**Nothing.** The agent asserted it a moment ago, and the memory will not repeat it
back, because no human has confirmed it. The caller cannot choose a trusted status. An administrator-approved
automation source is a separate, explicitly configured exception.

A reviewer opens `/review`, reads the evidence, and clicks Confirm. The same
question, asked again:

```jsonc
// recall "is web-prod-03 affected by anything critical"
{
  "search_mode": "keyword_only",
  "count": 1,
  "results": [{
    "subject": "asset:web-prod-03",
    "predicate": "HAS_VULN",
    "object": "cve:CVE-2026-1234",
    "status": "trusted",
    "confidenceLabel": "TRUSTED",
    "confirmedBy": "alice@example.com",
    "confirmedAt": "2026-09-17T15:32:13.387Z",
    "evidence": {
      "source": "tenable-hexa",
      "quote": "Tenable plugin 201455: Apache Struts remote code execution on web-prod-03. Severity Critical, CVSS 9.8, first seen 2026-09-10, still present at last scan..."
    }
  }]
}
```

The answer arrives with its provenance attached: who confirmed it, when, and the
exact evidence it rests on. Ask `fact_history` and you get the hash-chained audit
trail behind that one claim:

```jsonc
// fact_history  asset:web-prod-03  HAS_VULN  cve:CVE-2026-1234
"audit": [
  { "seq": 2, "actor": "alice@example.com", "action": "fact.assert",  "at": "...345Z" },
  { "seq": 3, "actor": "alice@example.com", "action": "fact.confirm", "at": "...387Z" }
]
```

You can reproduce this flow with `npm test` from `worker/`.

## Practical workflows

Four situations every vulnerability programme runs into. In each one the cost is
not the finding, it is the work the finding causes a second time. Every response
below is captured from a real run, not written to look plausible.

### The same false positive, investigated three times

A scanner flags a critical CVE on `db-prod-01`. An analyst spends an afternoon
with the DBA team and establishes the affected module is not loaded in your
build. Next scan cycle, the finding is back. It is back the cycle after that too.

The determination lives in a Slack thread, a closed ticket, or the head of
whoever did the work. So the second analyst starts from zero, and the third one
does too.

```jsonc
// recall "CVE-2026-0077 db-prod-01"
{
  "predicate": "FALSE_POSITIVE",
  "status": "trusted",
  "confidenceLabel": "TRUSTED",
  "confirmedBy": "priya@example.com",
  "confirmedAt": "2026-09-17T15:48:54.174Z",
  "reason": "The affected module is not loaded in our build. Confirmed with the DBA team.",
  "evidence": {
    "source": "analyst-note",
    "quote": "Reviewed CVE-2026-0077 on db-prod-01 with the DBA team on 2026-09-12. The affected module is not loaded in our build, so this is a false positive..."
  }
}
```

The agent asks before it escalates. The second investigation never happens, and
the reason is attached to the answer rather than remembered by a person.

### The risk acceptance that quietly became permanent

Risk acceptances are where exposure hides. Someone accepts a critical finding for
a fortnight because a release is frozen, and then the fortnight ends and nothing
happens. It stays accepted, silently, until an auditor finds it.

This memory will not let you record that shape of decision:

```jsonc
// assert_fact  ACCEPTED_RISK  with no expiry
{ "isError": true, "text": "invalid_input: ACCEPTED_RISK requires validTo (an expiry date)" }

// assert_fact  ACCEPTED_RISK  with no stated reason
{ "isError": true, "text": "invalid_input: ACCEPTED_RISK requires a reason" }
```

`ACCEPTED_RISK` **cannot be recorded without an expiry date and a stated reason**.
It is enforced in the predicate rules, not left to a convention people drift from.
When the date passes, the acceptance stops being current automatically because
validity is part of the query, so there is no job to schedule and nothing to
forget. The vulnerability simply reappears as untriaged.

### The fix that silently regressed

A vulnerability is remediated and recorded. Months later a rebuild, a rollback or
a new host from an old image brings it back.

Because a newly confirmed `HAS_VULN` closes the matching `REMEDIATED` rather than
sitting alongside it, the memory ends up with one current answer and a history
showing the fix and the regression in order. You get the regression as a fact,
not as two contradictory records for a human to reconcile.

### The audit question nobody can answer quickly

> "Who decided this was acceptable, on what basis, and when does that expire?"

That question normally costs days of searching tickets and chat logs, and the
answer is often unprovable afterwards.

```jsonc
// fact_history
"audit": [
  { "seq": 2, "actor": "alice@example.com", "action": "fact.assert",  "at": "...345Z" },
  { "seq": 3, "actor": "alice@example.com", "action": "fact.confirm", "at": "...387Z" }
]
```

Every decision is an append-only, hash-chained entry that names the person and
the moment. `as_of` answers what the team believed on a past date rather than
today's view backdated, which is the difference between explaining an incident
and guessing about it.

### And the one that is about protection rather than time

Scanner output, ticket comments and pasted chat logs are attacker-reachable text.
An agent that treats its own memory as ground truth will act on a sentence
somebody planted there, which is OWASP ASI06 memory poisoning.

Here, that text is stored quoted, flagged when it looks like an instruction, and
**cannot promote itself**. Model suggestions always remain proposals until browser review. Administrators
can separately allowlist an automation identity for a named source; the integrity
of that trusted source remains part of the deployment's security boundary.

### Who this fits

| If you are | The part that matters |
|---|---|
| A team building security agents | Agents stop re-deriving decisions, and a poisoned input cannot become a fact |
| An analyst working in Claude Code | Ask what the team already decided before you open an investigation |
| An MSSP across many clients | One database and one vector namespace per client, so there is no shared table to leak from |
| Anyone facing an audit | Every decision already carries who, when, why and the evidence |
