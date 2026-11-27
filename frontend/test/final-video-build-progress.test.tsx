import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinalVideoDownload } from "../src/components/FinalVideoDownload";
import { SessionPage } from "../src/components/SessionPage";
import type { AssemblyProgress, Phase, SessionEventPayload } from "../src/types";

// final-video-build-progress, design Decision 5 — a progress bar while any final video is built, and a disabled
// download while a new version replaces an existing one.

const version1 = { version: 1, pendingPauseEdits: false, staleScenes: true };
const preparing: AssemblyProgress = { step: "preparing-clips", clipsDone: 23, clipsTotal: 70, percent: 16 };
const encoding: AssemblyProgress = { step: "encoding", clipsDone: 70, clipsTotal: 70, percent: 74 };
const bar = () => screen.getByRole("progressbar", { name: "Final video progress" });

describe("the progress bar", () => {
  it("shows the clips being prepared, with the percentage", () => {
    render(<FinalVideoDownload url="/final" finalVideo={version1} building progress={preparing} />);

    expect(bar()).toHaveAttribute("value", "16");
    expect(screen.getByText("Preparing clips: 23 of 70")).toBeInTheDocument();
    expect(screen.getByText("16%")).toBeInTheDocument();
  });

  it("shows the encode", () => {
    render(<FinalVideoDownload url="/final" finalVideo={version1} building progress={encoding} />);

    expect(bar()).toHaveAttribute("value", "74");
    expect(screen.getByText("Encoding the final video")).toBeInTheDocument();
  });

  it("waits to start, with no value, before the first progress", () => {
    render(<FinalVideoDownload url="/final" finalVideo={version1} building />);

    expect(bar()).not.toHaveAttribute("value");
    expect(screen.getByText("Waiting to start")).toBeInTheDocument();
  });

  it("shows on the first build, instead of the waiting line", () => {
    render(<FinalVideoDownload url={undefined} building progress={encoding} />);

    expect(bar()).toBeInTheDocument();
    expect(screen.queryByText("Available once every scene is done")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download final video" })).not.toBeInTheDocument();
  });

  it("is gone once the build ends", () => {
    const { rerender } = render(<FinalVideoDownload url="/final" finalVideo={version1} building progress={encoding} />);

    rerender(<FinalVideoDownload url="/final" finalVideo={{ ...version1, version: 2, staleScenes: false }} />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Version 2")).toBeInTheDocument();
  });
});

describe("the download while a new version is built", () => {
  it("is a disabled button, with a note that says when it comes back", () => {
    render(<FinalVideoDownload url="/final" finalVideo={version1} building progress={preparing} onRebuild={async () => ({})} />);

    expect(screen.getByRole("button", { name: "Download final video" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Download final video" })).not.toBeInTheDocument();
    expect(screen.getByText("The download is available again when the new version is ready.")).toBeInTheDocument();
    expect(screen.getByText("Version 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rebuild final video" })).not.toBeInTheDocument();
  });

  it("is a link again after a success", () => {
    render(<FinalVideoDownload url="/final" finalVideo={{ ...version1, version: 2, staleScenes: false }} />);

    expect(screen.getByRole("link", { name: "Download final video" })).toHaveAttribute("href", "/final");
    expect(screen.queryByText(/available again/)).not.toBeInTheDocument();
  });

  it("is a link again after a failure, with the cause", () => {
    const cause = "The new version could not be built: stub failure. Your current final video (version 1) is kept.";
    render(<FinalVideoDownload url="/final" finalVideo={{ ...version1, rebuildFailure: { cause } }} onRebuild={async () => ({})} />);

    expect(screen.getByRole("link", { name: "Download final video" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(cause);
  });
});

describe("on the session page", () => {
  const PHASES: Phase[] = ["voice-over", "decomposition", "scenes", "assembly"];
  const session = (overrides: Partial<SessionEventPayload>): SessionEventPayload => ({
    type: "session",
    sessionId: "s1",
    title: "A title",
    script: "A test script.",
    language: "en",
    state: "final-video-generating",
    paused: false,
    held: [],
    running: [],
    phases: PHASES.map((phase) => ({ phase, status: phase === "assembly" ? "in-progress" : "complete", heldCount: 0, stages: [] })),
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
    ...overrides,
  });
  const props = { sessionId: "s1", notFound: false, onStartNew: () => {}, onPause: async () => {}, onContinue: async () => {}, onRetry: async () => {}, onCorrect: async () => {}, onRetryPhase: async () => {} };
  const finalVideoSection = () => within(screen.getByRole("region", { name: "Final video phase" }));

  it("shows the bar on the first build", () => {
    render(<SessionPage {...props} snapshot={{ session: session({ assemblyProgress: preparing }), scenes: [] }} />);

    expect(finalVideoSection().getByRole("progressbar", { name: "Final video progress" })).toBeInTheDocument();
    expect(finalVideoSection().getByText("Preparing clips: 23 of 70")).toBeInTheDocument();
  });

  it("disables the download during a rebuild", () => {
    render(
      <SessionPage
        {...props}
        snapshot={{ session: session({ finalVideoUrl: "/sessions/s1/download/final-video", finalVideo: version1, assemblyProgress: encoding }), scenes: [] }}
      />,
    );

    expect(finalVideoSection().getByRole("button", { name: "Download final video" })).toBeDisabled();
    expect(finalVideoSection().getByText("Encoding the final video")).toBeInTheDocument();
  });
});
