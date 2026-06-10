function resolveBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    if (port && port !== "8085") {
      return `${protocol}//${hostname}:8085`;
    }
  }
  return "";
}

export const BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiFetchInit = RequestInit & {
  timeoutMs?: number;
};

export async function apiFetch<T>(
  path: string,
  init?: ApiFetchInit,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const { timeoutMs = 30_000, ...requestInit } = init ?? {};
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (requestInit.signal?.aborted) {
    controller.abort();
  } else {
    requestInit.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const res = await fetch(url, {
      ...requestInit,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...requestInit.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let message = `${res.status} ${res.statusText}`;
      if (body) {
        try {
          const json = JSON.parse(body);
          message = json.error ?? json.message ?? message;
        } catch {
          message = body;
        }
      }
      throw new ApiError(res.status, message);
    }

    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError" && !requestInit.signal?.aborted) {
      throw new ApiError(408, "Request timed out");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    requestInit.signal?.removeEventListener("abort", abortFromCaller);
  }
}
