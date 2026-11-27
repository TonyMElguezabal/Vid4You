import { describe, expect, it } from "vitest";
import { checkTimestamps } from "../src/narrationTimestamps.ts";
import {
  buildSpliceFilter,
  MAX_TAKE_SPEED_CHANGE,
  planTakeFit,
  spliceTimestamps,
  TAKE_CUT_LEAD_SECONDS,
  type TakeFitInput,
  type TakeFitScene,
} from "../src/narrationTakeFit.ts";

// redo-scene-narration (JOS-282), design Decision 3 — where each scene's new reading goes, and whether it fits.

function scene(overrides: Partial<TakeFitScene> & Pick<TakeFitScene, "startSeconds" | "endSeconds" | "takeSpeechStart" | "takeSpeechEnd">): TakeFitScene {
  return { sceneId: `scene-${overrides.index ?? 1}`, index: 1, basePauseSeconds: 1.0, ...overrides };
}

function input(scenes: TakeFitScene[], overrides: Partial<TakeFitInput> = {}): TakeFitInput {
  return { narrationDurationSeconds: 100, previousSpeechEndSeconds: null, takeDurationSeconds: scenes.at(-1)!.takeSpeechEnd + 0.1, scenes, ...overrides };
}

describe("planTakeFit", () => {
  it("keeps the speed when the pause absorbs the difference (13.54 s interval, 11.74 s of speech → 1.80 s pause)", () => {
    const plan = planTakeFit(input([scene({ index: 2, startSeconds: 9.218, endSeconds: 22.758, takeSpeechStart: 9.764, takeSpeechEnd: 21.504, basePauseSeconds: 0.9 })], { previousSpeechEndSeconds: 9.06 }));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const [part] = plan.parts;
    expect(part!.tempo).toBe(1);
    expect(part!.outputSpeechStart).toBeCloseTo(9.218, 9);
    expect(part!.pauseSeconds).toBeCloseTo(1.8, 6);
  });

  it("speeds a slightly long reading up by the least amount that leaves a 0.2 s pause", () => {
    const plan = planTakeFit(input([scene({ startSeconds: 10, endSeconds: 16, takeSpeechStart: 0.1, takeSpeechEnd: 6.05 })], { previousSpeechEndSeconds: 9 }));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.parts[0]!.tempo).toBeCloseTo(5.95 / 5.8, 9);
    expect(plan.parts[0]!.tempo).toBeLessThanOrEqual(1 + MAX_TAKE_SPEED_CHANGE);
    expect(plan.parts[0]!.pauseSeconds).toBeCloseTo(0.2, 9);
  });

  it("refuses a reading too long even 5% faster, by its excess at normal speed", () => {
    const plan = planTakeFit(input([scene({ index: 4, startSeconds: 10, endSeconds: 16, takeSpeechStart: 0.1, takeSpeechEnd: 6.9 })], { previousSpeechEndSeconds: 9 }));
    expect(plan).toEqual({ ok: false, sceneIndex: 4, problem: "too-long", bySeconds: expect.closeTo(1.0, 6) as number });
  });

  it("refuses a reading too short even 5% slower, against the larger of 3.0 s and its earlier pause", () => {
    const plan = planTakeFit(input([scene({ index: 3, startSeconds: 20, endSeconds: 33.5, takeSpeechStart: 0.1, takeSpeechEnd: 8.1, basePauseSeconds: 0.9 })], { previousSpeechEndSeconds: 19 }));
    expect(plan).toEqual({ ok: false, sceneIndex: 3, problem: "too-short", bySeconds: expect.closeTo(2.5, 6) as number });
  });

  it("allows a long pause up to the scene's own earlier pause when that was longer than 3.0 s", () => {
    const plan = planTakeFit(input([scene({ startSeconds: 20, endSeconds: 25, takeSpeechStart: 0.1, takeSpeechEnd: 0.8, basePauseSeconds: 4.3 })], { previousSpeechEndSeconds: 19 }));
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.parts[0]).toMatchObject({ tempo: 1, pauseSeconds: expect.closeTo(4.3, 9) as number });
  });

  it("starts every scene's speech at its interval's start and leaves no gap between the parts", () => {
    const plan = planTakeFit(
      input(
        [
          scene({ index: 1, sceneId: "a", startSeconds: 0, endSeconds: 9.218, takeSpeechStart: 0, takeSpeechEnd: 9.067 - 0.3 }),
          scene({ index: 2, sceneId: "b", startSeconds: 9.218, endSeconds: 22.756, takeSpeechStart: 9.764, takeSpeechEnd: 21.502 }),
        ],
        { narrationDurationSeconds: 725 },
      ),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.parts.map((part) => part.outputSpeechStart)).toEqual([0, 9.218]);
    expect(plan.parts[0]!.outputTo).toBe(plan.parts[1]!.outputFrom);
    expect(plan.baseKeptUntil).toBe(plan.parts[0]!.outputFrom);
    expect(plan.baseResumesAt).toBe(plan.parts[1]!.outputTo);
    // The session's first scene starts at 0: nothing of the base is kept before it, and there is no lead.
    expect(plan.parts[0]!.outputFrom).toBe(0);
    // The join back into the base is 50 ms before the next scene's speech.
    expect(plan.baseResumesAt).toBeCloseTo(22.756 - TAKE_CUT_LEAD_SECONDS, 9);
    // Each part's take audio begins in the take's own silence before the speech, and ends in the middle of the next pause.
    expect(plan.parts[1]!.takeFrom).toBeCloseTo(9.764 - TAKE_CUT_LEAD_SECONDS, 9);
    expect(plan.parts[0]!.takeTo).toBeCloseTo((8.767 + 9.764) / 2, 9);
  });

  it("joins at the narration's end for the session's last scene", () => {
    const plan = planTakeFit(input([scene({ startSeconds: 90, endSeconds: 100, takeSpeechStart: 0.1, takeSpeechEnd: 8 })], { previousSpeechEndSeconds: 89 }));
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.baseResumesAt).toBe(100);
  });

  it("uses less lead when the take has less than 50 ms of silence before its speech", () => {
    const plan = planTakeFit(input([scene({ startSeconds: 10, endSeconds: 16, takeSpeechStart: 0.02, takeSpeechEnd: 5 })], { previousSpeechEndSeconds: 9 }));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.parts[0]!.takeFrom).toBe(0);
    expect(plan.parts[0]!.outputFrom).toBeCloseTo(10 - 0.02, 9);
  });

  it("uses less lead when the earlier scene's speech ends less than 100 ms before the section", () => {
    const plan = planTakeFit(input([scene({ startSeconds: 10, endSeconds: 16, takeSpeechStart: 0.2, takeSpeechEnd: 5 })], { previousSpeechEndSeconds: 9.96 }));
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.parts[0]!.outputFrom).toBeCloseTo(9.98, 9);
  });
});

// ---- design Decision 3: the filtergraph, and the narration's new timestamps ----

function twoScenePlan() {
  const plan = planTakeFit({
    narrationDurationSeconds: 30,
    previousSpeechEndSeconds: null,
    takeDurationSeconds: 7.5,
    scenes: [
      { sceneId: "a", index: 1, startSeconds: 0, endSeconds: 5, basePauseSeconds: 1, takeSpeechStart: 0, takeSpeechEnd: 3.8 },
      { sceneId: "b", index: 2, startSeconds: 5, endSeconds: 10, basePauseSeconds: 1, takeSpeechStart: 4.4, takeSpeechEnd: 9.3 },
    ],
  });
  if (!plan.ok) throw new Error("the plan should fit");
  return plan;
}

describe("buildSpliceFilter", () => {
  it("keeps the base before and after, fills the section with the parts, and sums to the base's exact sample count", () => {
    const plan = twoScenePlan();
    const { filter, segmentSamples } = buildSpliceFilter(plan, { sampleRate: 44100, baseTotalSamples: 30 * 44100, gainDb: 1.8 });
    expect(segmentSamples.reduce((sum, samples) => sum + samples, 0)).toBe(30 * 44100);
    // The section starts the session: no base before it; the base resumes 50 ms before 10 s.
    expect(segmentSamples).toEqual([5 * 44100 - Math.round(0.05 * 44100), Math.round(9.95 * 44100) - (5 * 44100 - Math.round(0.05 * 44100)), 30 * 44100 - Math.round(9.95 * 44100)]);
    expect(filter).toContain("volume=1.8dB");
    expect(filter).toContain(`atrim=start_sample=${Math.round(9.95 * 44100)}`);
    expect(filter.endsWith("concat=n=3:v=0:a=1[out]")).toBe(true);
  });

  it("changes the speed only of a part whose tempo is not 1, and fades every join made in silence", () => {
    const plan = twoScenePlan();
    expect(plan.parts.map((part) => part.tempo === 1)).toEqual([true, false]);
    const { filter } = buildSpliceFilter(plan, { sampleRate: 44100, baseTotalSamples: 30 * 44100, gainDb: 0 });
    expect(filter.match(/atempo=/g)).toHaveLength(1);
    expect(filter).toContain(`atempo=${plan.parts[1]!.tempo.toFixed(6)}`);
    expect(filter).toContain("afade=t=in:st=0:d=0.010000");
    expect(filter).toContain("afade=t=out");
  });

  it("keeps the base before a section that starts later in the session", () => {
    const plan = planTakeFit({
      narrationDurationSeconds: 30,
      previousSpeechEndSeconds: 9,
      takeDurationSeconds: 5,
      scenes: [{ sceneId: "c", index: 3, startSeconds: 10, endSeconds: 30, basePauseSeconds: 1, takeSpeechStart: 0.1, takeSpeechEnd: 4.9 }],
    });
    // A last scene of 20 s with 4.8 s of speech cannot fit; take one that can.
    expect(plan.ok).toBe(false);
    const fitting = planTakeFit({
      narrationDurationSeconds: 30,
      previousSpeechEndSeconds: 9,
      takeDurationSeconds: 5,
      scenes: [{ sceneId: "c", index: 3, startSeconds: 10, endSeconds: 15, basePauseSeconds: 15, takeSpeechStart: 0.1, takeSpeechEnd: 4.0 }],
    });
    if (!fitting.ok) throw new Error("should fit");
    const { filter, segmentSamples } = buildSpliceFilter(fitting, { sampleRate: 44100, baseTotalSamples: 30 * 44100, gainDb: 0 });
    expect(segmentSamples[0]).toBe(Math.round(9.95 * 44100));
    expect(segmentSamples.reduce((sum, samples) => sum + samples, 0)).toBe(30 * 44100);
    expect(filter).toContain(`atrim=end_sample=${Math.round(9.95 * 44100)}`);
  });
});

describe("spliceTimestamps", () => {
  const script = "One two. Three four. Five six.";
  const at = (text: string, start: number, step = 0.1) => [...text].map((character, index) => ({ text: character, start: start + index * step, end: start + (index + 1) * step }));

  it("keeps the base characters before and after, and moves the take's by its placement and speed", () => {
    const base = [...at("One two. ", 0), ...at("Three four. ", 5), ...at("Five six.", 10)];
    const textStart = script.indexOf("Three");
    const textEnd = textStart + "Three four.".length;
    const take = at("Three four.", 0.05, 0.2);
    const plan = planTakeFit({
      narrationDurationSeconds: 15,
      previousSpeechEndSeconds: 0.8,
      takeDurationSeconds: 2.3,
      scenes: [{ sceneId: "b", index: 2, startSeconds: 5, endSeconds: 10, basePauseSeconds: 3.9, takeSpeechStart: 0.05, takeSpeechEnd: 2.25 }],
    });
    if (!plan.ok) throw new Error("should fit");
    const spliced = spliceTimestamps({ script, textStart, textEnd, base, take, plan });

    expect(spliced.map((c) => c.text).join("")).toBe(script);
    expect(spliced.slice(0, 9)).toEqual(base.slice(0, 9));
    expect(spliced.slice(-9)).toEqual(base.slice(-9));
    // The space after the text was inside the replaced section: it moves to where the take's speech ends.
    expect(spliced[20]).toEqual({ text: " ", start: expect.closeTo(7.2, 9) as number, end: expect.closeTo(7.2, 9) as number });
    // "T" lands exactly on the interval's start; the speed is unchanged, so the step stays 0.2 s.
    expect(spliced[9]).toEqual({ text: "T", start: 5, end: expect.closeTo(5.2, 9) as number });
    expect(checkTimestamps(spliced, script, 15, "exact")).toEqual({ usable: true });
  });

  it("works for alignment timestamps, which match the script ignoring whitespace", () => {
    const base = [...at("Onetwo.", 0), ...at("Threefour.", 5), ...at("Fivesix.", 10)];
    const textStart = script.indexOf("Three");
    const textEnd = textStart + "Three four.".length;
    const take = at("Three four.", 0.05, 0.2);
    const plan = planTakeFit({
      narrationDurationSeconds: 15,
      previousSpeechEndSeconds: 0.7,
      takeDurationSeconds: 2.3,
      scenes: [{ sceneId: "b", index: 2, startSeconds: 5, endSeconds: 10, basePauseSeconds: 4, takeSpeechStart: 0.05, takeSpeechEnd: 2.25 }],
    });
    if (!plan.ok) throw new Error("should fit");
    const spliced = spliceTimestamps({ script, textStart, textEnd, base, take, plan });
    expect(checkTimestamps(spliced, script, 15, "ignore-whitespace")).toEqual({ usable: true });
    expect(spliced.slice(0, 7)).toEqual(base.slice(0, 7));
    expect(spliced.slice(-8)).toEqual(base.slice(-8));
  });

  it("refuses base timestamps in which the text cannot be found", () => {
    const plan = twoScenePlan();
    expect(() => spliceTimestamps({ script, textStart: 0, textEnd: 8, base: at("Other.", 0), take: at("One two.", 0), plan })).toThrow();
  });
});

describe("planTakeFit edge cases", () => {
  it("fails as too long when the interval has no room for even the shortest pause", () => {
    const plan = planTakeFit({
      narrationDurationSeconds: 100,
      previousSpeechEndSeconds: null,
      takeDurationSeconds: 1,
      scenes: [{ sceneId: "a", index: 4, startSeconds: 10, endSeconds: 10.1, basePauseSeconds: 0.05, takeSpeechStart: 0.1, takeSpeechEnd: 0.6 }],
    });
    expect(plan).toEqual({ ok: false, sceneIndex: 4, problem: "too-long", bySeconds: expect.closeTo(0.6, 9) as number });
  });
});
