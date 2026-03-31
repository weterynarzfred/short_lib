import Typesense from "typesense";

let cachedClient = null;

function parseHost(rawHost) {
  const trimmed = String(rawHost ?? "").trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const protocol = url.protocol === "https:" ? "https" : "http";
    const host = url.hostname;
    const port = Number(url.port || (protocol === "https" ? 443 : 80));
    const path = url.pathname && url.pathname !== "/" ? url.pathname.replace(/\/+$/, "") : "";

    if (!host || !Number.isFinite(port)) return null;
    return { protocol, host, port, path };
  } catch {
    return null;
  }
}

function getConfig() {
  const apiKey = String(process.env.TYPESENSE_API_KEY ?? "").trim();
  const hostConfig = parseHost(process.env.TYPESENSE_HOST);

  if (!apiKey || !hostConfig) return null;

  return {
    apiKey,
    node: hostConfig,
  };
}

export function isTypesenseConfigured() {
  return Boolean(getConfig());
}

export function getTypesenseClient() {
  if (cachedClient) return cachedClient;

  const config = getConfig();
  if (!config)
    throw new Error("Typesense is not configured. Set TYPESENSE_HOST and TYPESENSE_API_KEY.");

  cachedClient = new Typesense.Client({
    apiKey: config.apiKey,
    nodes: [config.node],
    connectionTimeoutSeconds: 2,
    numRetries: 2,
  });

  return cachedClient;
}
