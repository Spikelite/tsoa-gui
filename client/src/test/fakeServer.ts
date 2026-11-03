import { vi } from "vitest";

export interface Sent {
  method: string;
  path: string;
  body: unknown;
  csrf: string | null;
}

type Answer = { status?: number; body?: unknown } | ((sent: Sent) => { status?: number; body?: unknown });

/**
 * Stands in for the server's API: answers each "METHOD /api/path" from
 * answers, and 404 for anything else. Every request is kept in sent.
 */
export function fakeServer(answers: Record<string, Answer>) {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const headers = (init.headers ?? {}) as Record<string, string>;
    const request: Sent = {
      method,
      path: input,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      csrf: headers["X-CSRF-Token"] ?? null,
    };
    sent.push(request);
    const answer = answers[`${method} ${input}`];
    const { status = 200, body } = typeof answer === "function" ? answer(request) : (answer ?? { status: 404 });
    return new Response(status === 204 || body === undefined ? null : JSON.stringify(body), { status });
  });
  return sent;
}
