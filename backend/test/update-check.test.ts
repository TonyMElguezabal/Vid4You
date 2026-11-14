import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { BuildConfig } from "../src/config/build.ts";
import { buildApp } from "../src/server.ts";
import { checkForUpdate, resetUpdateCheckForTest, startUpdateCheck } from "../src/telemetry/updateCheck.ts";

// add-observability-telemetry (JOS-199), group 5 — Decision 9: one GitHub Releases call per launch, never an error.
const production: BuildConfig = {
  version: "1.0.0",
  channel: "production",
  releaseTag: "t1",
  repository: "owner/repo",
  telemetryEndpoint: "http://127.0.0.1:4318",
};
const uatCandidate: BuildConfig = { ...production, version: "1.0.0-rc.1", channel: "uat", releaseTag: "v1.0.0-rc.1" };

function respondWith(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
}

beforeEach(() => resetUpdateCheckForTest());

describe("checkForUpdate", () => {
  it("reports a newer production release with its page URL", async () => {
    const fetchStub = respondWith({ tag_name: "t2", html_url: "https://github.com/owner/repo/releases/tag/t2" });
    expect(await checkForUpdate(production, fetchStub)).toEqual({ available: true, tag: "t2", url: "https://github.com/owner/repo/releases/tag/t2" });
    expect(String(fetchStub.mock.calls[0]?.[0])).toBe("https://api.github.com/repos/owner/repo/releases/latest");
  });

  it("reports nothing when the newest release is the running tag", async () => {
    const fetchStub = respondWith({ tag_name: "t1", html_url: "https://example.test/t1" });
    expect(await checkForUpdate(production, fetchStub)).toEqual({ available: false });
  });

  it("takes the newest pre-release on the uat channel", async () => {
    const fetchStub = respondWith([
      { tag_name: "v1.0.0-rc.2", html_url: "https://example.test/rc2", prerelease: true },
      { tag_name: "v1.0.0-rc.1", html_url: "https://example.test/rc1", prerelease: true },
    ]);
    expect(await checkForUpdate(uatCandidate, fetchStub)).toEqual({ available: true, tag: "v1.0.0-rc.2", url: "https://example.test/rc2" });
    expect(String(fetchStub.mock.calls[0]?.[0])).toBe("https://api.github.com/repos/owner/repo/releases?per_page=20");
  });

  it("takes the newest final release on the uat channel when it is newer than every pre-release", async () => {
    const fetchStub = respondWith([
      { tag_name: "v1.0.0", html_url: "https://example.test/v1", prerelease: false },
      { tag_name: "v1.0.0-rc.2", html_url: "https://example.test/rc2", prerelease: true },
    ]);
    expect(await checkForUpdate({ ...uatCandidate, releaseTag: "v1.0.0-rc.2" }, fetchStub)).toEqual({ available: true, tag: "v1.0.0", url: "https://example.test/v1" });
  });

  it("reports nothing and warns once on a network error", async () => {
    const warn = vi.fn();
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await checkForUpdate(production, failing, warn)).toEqual({ available: false });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("reports nothing on a non-200 answer such as a rate limit", async () => {
    expect(await checkForUpdate(production, respondWith({ message: "rate limited" }, 403), vi.fn())).toEqual({ available: false });
  });

  it("times out after 5 seconds", async () => {
    const hanging = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    vi.useFakeTimers();
    try {
      const pending = checkForUpdate(production, hanging, vi.fn());
      await vi.advanceTimersByTimeAsync(5001);
      expect(await pending).toEqual({ available: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends no request on the development channel or without a release tag", async () => {
    const fetchStub = respondWith({});
    expect(await checkForUpdate({ ...production, channel: "development" }, fetchStub)).toEqual({ available: false });
    expect(await checkForUpdate({ ...production, releaseTag: null }, fetchStub)).toEqual({ available: false });
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("GET /app/update", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildApp();
  });

  it("returns the stored result of the launch check", async () => {
    startUpdateCheck(production, respondWith({ tag_name: "t2", html_url: "https://example.test/t2" }));
    const res = await app.inject({ method: "GET", url: "/app/update" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ available: true, tag: "t2", url: "https://example.test/t2" });
  });

  it("returns available false when no check was started", async () => {
    expect((await app.inject({ method: "GET", url: "/app/update" })).json()).toEqual({ available: false });
  });
});
