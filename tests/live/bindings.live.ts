/**
 * Live verification against a real Cloudflare account. Not part of `npm test`.
 *
 *   CLOUDFLARE_ACCOUNT_ID=<your account> npm run verify:live
 *
 * Runs the Worker locally but sends the AI and VECTORS bindings to your account,
 * so it makes a handful of Workers AI calls and writes three vectors into a fresh
 * probe namespace in your `keendreams-memory` index, then deletes them. It needs
 * the index to exist. Vectorize indexes asynchronously, so the run waits for the
 * new vectors to become queryable, which usually takes one to two minutes.
 */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import type { ClientMemory } from "../../src/memory/ClientMemory";
import { backendFromEnv, type SearchEnv } from "../../src/search/backend";
import { runChecks } from "../../src/web/health";
import { ALICE } from "../helpers";

const report: Record<string, unknown> = {};
const log = (k: string, v: unknown) => {
  report[k] = v;
  console.log(`LIVE ${k} >>> ${JSON.stringify(v)}`);
};

it("exercises real Vectorize and Workers AI end to end", async () => {
  // 1. Health probes against the real bindings.
  const checks = await runChecks(env as never);
  log("health", checks);

  const backend = backendFromEnv(env as unknown as SearchEnv);
  expect(backend).not.toBeNull();
  if (!backend) return;

  // 2. A real client memory, in its own probe namespace so nothing collides.
  const slug = `live-verify-${Date.now()}`;
  const memory = env.CLIENT_MEMORY.getByName(`client:${slug}`);
  await runInDurableObject(memory, (i: ClientMemory) => i.rememberSlug(slug));

  const episode = await memory.recordEpisode(ALICE, {
    content:
      "Tenable plugin 201455: Apache Struts remote code execution on web-prod-03. " +
      "Severity Critical, CVSS 9.8. The host is internet facing and owned by the payments team.",
    source: "tenable-hexa",
  });
  const fact = await memory.assertFact(ALICE, {
    subject: "asset:web-prod-03",
    predicate: "HAS_VULN",
    object: "cve:CVE-2026-1234",
    evidenceEpisodeId: episode.episodeId,
  });
  await memory.confirmFact("reviewer@example.com", fact.factId);

  // 3. Drain the queue: real embeddings, real upsert.
  const drainStart = Date.now();
  let drained = false;
  for (let i = 0; i < 5 && !drained; i++) {
    await runDurableObjectAlarm(memory);
    const status = await memory.queueStatus();
    drained = status.pending === 0 && status.failed === 0;
  }
  log("queue_after_drain", { ...(await memory.queueStatus()), ms: Date.now() - drainStart });

  // 4. Vectorize indexes asynchronously. Poll until the vector leg sees our episode.
  const target = `episode:${episode.episodeId}`;
  const question = "which internet facing machine can be taken over remotely";
  const [queryVector] = await backend.embed([question]);
  let visibleAfterMs = -1;
  const pollStart = Date.now();
  while (Date.now() - pollStart < 150_000) {
    const hits = await backend.query(queryVector ?? [], slug, 10);
    if (hits.some((h) => h.id === target)) {
      visibleAfterMs = Date.now() - pollStart;
      break;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  log("vector_visible_after_ms", visibleAfterMs);

  // 5. The semantic question shares almost no words with the evidence.
  const recall = await memory.recall({ query: question });
  log("recall_semantic", {
    searchMode: recall.searchMode,
    count: recall.count,
    top: recall.results[0] && {
      subject: recall.results[0].subject,
      predicate: recall.results[0].predicate,
      object: recall.results[0].object,
      status: recall.results[0].status,
    },
  });

  // 6. suggest_facts against the real model, on a different piece of evidence.
  const note = await memory.recordEpisode(ALICE, {
    content:
      "Change ticket SEC-142: the payments team patched CVE-2026-1234 on web-prod-03 " +
      "on 2026-09-16 and a rescan confirmed the finding is gone. j.doe@example.com owns web-prod-03.",
    source: "ticket",
  });
  let suggestion: unknown;
  try {
    const result = await memory.suggestFacts(ALICE, note.episodeId);
    suggestion = {
      model: result.model,
      dropped: result.dropped,
      proposals: result.proposals.map((p) => ({ status: p.status })),
    };
  } catch (error) {
    suggestion = { error: (error as Error).message };
  }
  log("suggest_facts", suggestion);
  const facts = await memory.listProposals(20);
  log(
    "suggested_facts_detail",
    facts.map(
      (f) => `${f.subject} ${f.predicate} ${f.object} [${f.status}] model=${f.suggestedByModel}`,
    ),
  );

  // 7. Clean up the probe vectors.
  const ids = [`episode:${episode.episodeId}`, `fact:${fact.factId}`, `episode:${note.episodeId}`];
  await backend.deleteByIds(ids).catch(() => undefined);
  log("cleanup", { deleted: ids.length, namespace: slug });
});
