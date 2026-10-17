// Входная точка сайта на Cloudflare: сборка OpenNext плюс общий кэш публичных страниц (lib/page-cache.ts).
import worker from "./.open-next/worker.js";
import { withPageCache } from "./lib/page-cache.ts";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const handler = {
  fetch(request, env, ctx) {
    return withPageCache(request, env.CF_VERSION_METADATA?.id ?? "dev", globalThis.caches?.default, ctx, (req) => worker.fetch(req, env, ctx));
  },
};

export default handler;
