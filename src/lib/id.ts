import crypto from "node:crypto";

/** Short, URL-safe, time-sortable-ish unique id. */
export function createId() {
  return Date.now().toString(36) + crypto.randomBytes(8).toString("hex");
}
