import { config, modelRoutes } from "./config.js";

export function resolveUpstream(modelId: string | undefined): { baseUrl: string; apiKey: string | undefined } {
  const route = modelRoutes.find((r) => r.modelId === modelId);
  const baseUrl = route?.upstream ?? config.defaultUpstream;
  const apiKey = route?.apiKey ?? config.upstreamApiKey;
  return { baseUrl, apiKey: apiKey ?? undefined };
}
