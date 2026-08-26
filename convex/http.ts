import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Convex Auth registers its own routes (token exchange, etc.).
auth.addHttpRoutes(http);

// The AgentMail inbound webhook route is added in Task 4, under /webhooks/.

export default http;
