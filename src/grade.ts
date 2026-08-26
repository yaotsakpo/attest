// Re-export the canonical grade logic so the frontend and backend share one
// source of truth (convex/lib/grade.ts).
export { gradeFor, type Grade } from "../convex/lib/grade";
