import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No ISR/revalidate pages in this app (landing is static, everything else
// is fully dynamic dashboard/POS/API routes), so no R2 incremental cache
// bucket is needed — the adapter's default in-memory cache is enough.
export default defineCloudflareConfig();
