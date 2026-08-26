import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// App-owned root routing: the static site is served via a catch-all in
// convex/http.ts, but our EXACT routes win — so /webhooks/agentmail (AgentMail
// posts here), /registry/domains (the public agent API), and the Convex Auth
// routes all keep their root URLs. Exact routes beat the static catch-all.
const app = defineApp();
app.use(staticHosting);

export default app;
