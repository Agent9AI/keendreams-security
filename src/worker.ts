export { ClientMemory } from "./memory/ClientMemory";
export { Registry } from "./registry/registry";

export default {
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
