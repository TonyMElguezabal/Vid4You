import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { TopBar } from "../src/components/TopBar";

// show-app-version (JOS-238), tasks 3.1 to 3.3 — the top bar shows the backend's version on every screen.
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

/** A live connection that never connects: the session page only needs it not to throw (same stand-in as admin-page.test.tsx). */
class QuietEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  addEventListener() {}
  removeEventListener() {}
  close() {
    this.readyState = 2;
  }
}

const RELEASE = { version: "1.0.0", channel: "production" as const };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A backend that answers the page's start-up requests; `version` is what `/app/version` returns (a failure when undefined). */
function stubBackend(version: unknown) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith("/app/version")) return version === undefined ? json({}, 500) : json(version);
      if (url.endsWith("/languages")) return json([{ code: "en", label: "English" }]);
      if (url.endsWith("/telemetry/consent")) return json({ errors: false, providerUsage: false, productUsage: false, answered: true });
      if (url.endsWith("/app/update")) return json({ available: false });
      return json({}, 404);
    }),
  );
  return calls;
}

describe("TopBar version label", () => {
  it("shows v<version> on a production build, with its accessible name", () => {
    render(<TopBar appVersion={RELEASE} />);
    expect(screen.getByLabelText("Vid4You version 1.0.0")).toHaveTextContent("v1.0.0");
  });

  it("shows 'Development build' on the development channel", () => {
    render(<TopBar appVersion={{ version: "0.0.0-dev", channel: "development" }} />);
    expect(screen.getByLabelText("Vid4You version 0.0.0-dev")).toHaveTextContent("Development build");
  });

  it("marks a uat build", () => {
    render(<TopBar appVersion={{ version: "1.0.0", channel: "uat" }} />);
    expect(screen.getByLabelText("Vid4You version 1.0.0")).toHaveTextContent("v1.0.0 · uat");
  });

  it("renders without the label when there is no version", () => {
    render(<TopBar />);
    expect(screen.queryByLabelText(/Vid4You version/)).not.toBeInTheDocument();
    expect(screen.getByText("Vid4You")).toBeInTheDocument();
  });
});

describe("App version request", () => {
  it("shows the version on the start form", async () => {
    stubBackend(RELEASE);
    render(<App />);
    expect(await screen.findByText("v1.0.0")).toBeInTheDocument();
  });

  it("shows the version on /admin", async () => {
    stubBackend(RELEASE);
    window.history.pushState({}, "", "/admin");
    render(<App />);
    expect(await screen.findByText("v1.0.0")).toBeInTheDocument();
  });

  it("asks once, also after moving from a session page to the start form", async () => {
    const calls = stubBackend(RELEASE);
    vi.stubGlobal("EventSource", QuietEventSource);
    window.history.pushState({}, "", "/?sessionId=s1");
    render(<App />);
    expect(await screen.findByText("v1.0.0")).toBeInTheDocument();
    await userEvent.setup().click(await screen.findByRole("button", { name: "New project" }));
    expect(await screen.findByText("v1.0.0")).toBeInTheDocument();
    expect(calls.filter((url) => url.endsWith("/app/version"))).toHaveLength(1);
  });

  it("shows no label and no alert when the request fails", async () => {
    const calls = stubBackend(undefined);
    render(<App />);
    await waitFor(() => expect(calls.some((url) => url.endsWith("/app/version"))).toBe(true));
    expect(screen.queryByLabelText(/Vid4You version/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
