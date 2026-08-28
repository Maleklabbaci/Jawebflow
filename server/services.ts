import type { JawebflowServices } from "./adapters/contracts";
import { localServices } from "./adapters/localServices";

let testOverride: JawebflowServices | null = null;

/**
 * Single dependency boundary for JawebFlow business routes.
 * Replace localServices with a Supabase-backed implementation once its keys are configured.
 */
export function getJawebflowServices(): JawebflowServices {
  return testOverride ?? localServices;
}

export function setJawebflowServicesForTesting(services: JawebflowServices | null) {
  testOverride = services;
}
