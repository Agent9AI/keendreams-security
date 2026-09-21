import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { FactStatus } from "../memory/types";
import { openClient, originForEvidence, principalOf, type ToolContext } from "./context";
import { labelFact, run } from "./results";

const CLIENT = {
  client: z.string().optional().describe("Client slug. Leave this out in single-team deployments."),
};
// All tools stay within the deployment's memory, index and configured model.
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
// Even deduplicated episode writes consume quota. Fact writes also update
// observation/audit state, and another model run can propose different facts.
const WRITES = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

function reviewUrl(ctx: ToolContext, slug: string): string {
  return `${ctx.origin}/review?client=${encodeURIComponent(slug)}`;
}

/** Registers the nine memory tools on a per-request server instance. */
export function registerMemoryTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "record_episode",
    {
      title: "Record evidence",
      description:
        "Store raw evidence as an episode: scan output, a ticket, a chat excerpt or an analyst note. Credentials are blanked out before storage, and the text is kept as quoted evidence, never as instructions.",
      inputSchema: z.object({
        ...CLIENT,
        content: z.string().min(1).describe("The raw evidence text."),
        source: z
          .string()
          .describe(
            "Where it came from, for example tenable-hexa, nessus, ticket or analyst-note.",
          ),
        observed_at: z
          .string()
          .optional()
          .describe("ISO 8601 time the evidence was observed. Defaults to now."),
      }),
      annotations: WRITES,
    },
    async (input) =>
      run(async () => {
        const open = await openClient(ctx, input.client);
        const result = await open.memory.recordEpisode(
          principalOf(ctx.props),
          { content: input.content, source: input.source, observedAt: input.observed_at },
          { writesPerMinute: open.writesPerMinute, clientSlug: open.slug },
        );
        return { client: open.slug, ...result };
      }),
  );

  server.registerTool(
    "assert_fact",
    {
      title: "Propose a fact",
      description:
        "Record that a subject relates to an object, citing the episode that proves it. Facts stay UNCONFIRMED until a reviewer confirms them in a browser, unless they come from an allowlisted automation source.",
      inputSchema: z.object({
        ...CLIENT,
        subject: z.string().describe("Canonical key, for example asset:web-prod-03."),
        predicate: z
          .string()
          .describe(
            "One of HAS_VULN, REMEDIATED, FALSE_POSITIVE, ACCEPTED_RISK, OWNS, OBSERVED, RELATED_TO.",
          ),
        object: z.string().describe("Canonical key, for example cve:CVE-2026-1234."),
        evidence_episode_id: z.string().describe("Episode id returned by record_episode."),
        valid_from: z.string().optional().describe("ISO 8601 time the fact became true."),
        valid_to: z.string().optional().describe("ISO 8601 expiry. Required for ACCEPTED_RISK."),
        reason: z
          .string()
          .optional()
          .describe("Why, in one or two sentences. Required for ACCEPTED_RISK."),
      }),
      // Allowlisted assertions can supersede existing trusted facts.
      annotations: { ...WRITES, destructiveHint: true },
    },
    async (input) =>
      run(async () => {
        const open = await openClient(ctx, input.client);
        const principal = principalOf(ctx.props);
        const origin = await originForEvidence(open, principal, input.evidence_episode_id);
        const result = await open.memory.assertFact(
          principal,
          {
            subject: input.subject,
            predicate: input.predicate,
            object: input.object,
            evidenceEpisodeId: input.evidence_episode_id,
            validFrom: input.valid_from,
            validTo: input.valid_to,
            reason: input.reason,
          },
          origin,
          { writesPerMinute: open.writesPerMinute, clientSlug: open.slug },
        );
        return {
          client: open.slug,
          ...labelFact(result),
          review_url: result.status === "proposed" ? reviewUrl(ctx, open.slug) : undefined,
        };
      }),
  );

  server.registerTool(
    "find_facts",
    {
      title: "Find facts",
      description:
        "Exact lookup by subject, relationship, object or status. Answers questions like whether a CVE on a host was already accepted as risk. Use as_of to ask what was true on a past date.",
      inputSchema: z.object({
        ...CLIENT,
        subject: z.string().optional(),
        predicate: z.string().optional(),
        object: z.string().optional(),
        status: z
          .enum(["current", "proposed", "trusted", "rejected", "superseded"])
          .optional()
          .describe("Defaults to current: trusted and still valid."),
        as_of: z.string().optional().describe("ISO 8601 date, only with the default status."),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const open = await openClient(ctx, input.client);
        const facts = await open.memory.findFacts({
          subject: input.subject,
          predicate: input.predicate,
          object: input.object,
          status: input.status as "current" | FactStatus | undefined,
          asOf: input.as_of,
          limit: input.limit,
        });
        return { client: open.slug, count: facts.length, facts: facts.map(labelFact) };
      }),
  );

  server.registerTool(
    "get_entity",
    {
      title: "Get an entity",
      description:
        "Everything currently known about one asset, vulnerability, identity or indicator, with its neighbors and how many proposals are waiting for review.",
      inputSchema: z.object({ ...CLIENT, key: z.string().describe("Canonical key.") }),
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const open = await openClient(ctx, input.client);
        const entity = await open.memory.getEntity(input.key);
        return { client: open.slug, ...entity, facts: entity.facts.map(labelFact) };
      }),
  );

  server.registerTool(
    "explore_graph",
    {
      title: "Explore the graph",
      description:
        "Walk outward from an entity across trusted relationships, up to three hops, optionally limited to certain relationship types.",
      inputSchema: z.object({
        ...CLIENT,
        key: z.string().describe("Canonical key to start from."),
        depth: z.number().int().min(1).max(3).optional(),
        predicates: z.array(z.string()).max(7).optional(),
      }),
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const open = await openClient(ctx, input.client);
        const graph = await open.memory.exploreGraph({
          key: input.key,
          depth: input.depth,
          predicates: input.predicates,
        });
        return { client: open.slug, ...graph, edges: graph.edges.map(labelFact) };
      }),
  );

  server.registerTool(
    "fact_history",
    {
      title: "Fact history",
      description:
        "The full timeline for one relationship: every version, what replaced it, who confirmed it and when. Built for audits.",
      inputSchema: z.object({
        ...CLIENT,
        fact_id: z.string().optional(),
        subject: z.string().optional(),
        predicate: z.string().optional(),
        object: z.string().optional(),
      }),
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const open = await openClient(ctx, input.client);
        const history = await open.memory.factHistory({
          factId: input.fact_id,
          subject: input.subject,
          predicate: input.predicate,
          object: input.object,
        });
        return { client: open.slug, ...history, facts: history.facts.map(labelFact) };
      }),
  );

  server.registerTool(
    "list_proposals",
    {
      title: "List pending proposals",
      description:
        "Facts waiting for a reviewer, each with a short quote of its evidence and any flags. Confirming happens only on the review page in a browser.",
      inputSchema: z.object({ ...CLIENT, limit: z.number().int().min(1).max(200).optional() }),
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const open = await openClient(ctx, input.client);
        const proposals = await open.memory.listProposals(input.limit);
        return {
          client: open.slug,
          count: proposals.length,
          review_url: reviewUrl(ctx, open.slug),
          proposals: proposals.map(labelFact),
        };
      }),
  );

  server.registerTool(
    "recall",
    {
      title: "Recall",
      description:
        "Ask a question in plain language. Combines keyword and semantic search over the evidence and returns the facts that answer it, each with a quote of what it rests on. Only confirmed facts come back unless include_proposed is true.",
      inputSchema: z.object({
        ...CLIENT,
        query: z.string().min(1).describe("The question, or the words to look for."),
        as_of: z.string().optional().describe("ISO 8601 date. Answers as of that moment."),
        include_proposed: z
          .boolean()
          .optional()
          .describe("Include facts nobody has confirmed yet. They stay marked UNCONFIRMED."),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const open = await openClient(ctx, input.client);
        const view = await open.memory.recall({
          query: input.query,
          asOf: input.as_of,
          includeProposed: input.include_proposed,
          limit: input.limit,
        });
        return {
          client: open.slug,
          search_mode: view.searchMode,
          count: view.count,
          results: view.results.map(labelFact),
          related: view.related.map(labelFact),
          review_url: view.results.some((fact) => fact.status === "proposed")
            ? reviewUrl(ctx, open.slug)
            : undefined,
        };
      }),
  );

  server.registerTool(
    "suggest_facts",
    {
      title: "Suggest facts from evidence",
      description:
        "Reads one episode with the deployment's own model and proposes the relationships it finds. Every suggestion is stored UNCONFIRMED for a human to review, and anything malformed is dropped and counted.",
      inputSchema: z.object({
        ...CLIENT,
        episode_id: z.string().describe("Episode id returned by record_episode."),
      }),
      annotations: WRITES,
    },
    async (input) =>
      run(async () => {
        const open = await openClient(ctx, input.client);
        const result = await open.memory.suggestFacts(principalOf(ctx.props), input.episode_id, {
          writesPerMinute: open.writesPerMinute,
          clientSlug: open.slug,
        });
        return {
          client: open.slug,
          model: result.model,
          dropped: result.dropped,
          proposals: result.proposals.map(labelFact),
          review_url: reviewUrl(ctx, open.slug),
        };
      }),
  );
}
