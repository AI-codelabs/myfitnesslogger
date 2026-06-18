import { describe, expect, it } from "vitest";
import {
  DEFAULT_REST,
  formatSetsRepsForDisplay,
  parseSetsReps,
  serializeSetsReps,
} from "@/lib/setsReps";

describe("sets/reps formatting", () => {
  it("displays default-rest serialized values in compact legacy form", () => {
    expect(formatSetsRepsForDisplay("8x @120s, 10x @120s, 10x @120s")).toBe(
      "8x 10x 10x",
    );
  });

  it("keeps already compact legacy values compact", () => {
    expect(formatSetsRepsForDisplay("12x 12x 12x")).toBe("12x 12x 12x");
  });

  it("preserves explicit non-default rest values", () => {
    expect(formatSetsRepsForDisplay("8x @90s, 10x @120s")).toBe("8x @90s, 10x");
  });

  it("serializes default-rest editor output compactly", () => {
    expect(
      serializeSetsReps([
        { reps: "8", rest: DEFAULT_REST },
        { reps: "10", rest: DEFAULT_REST },
      ]),
    ).toBe("8x 10x");
  });

  it("still parses compact serialized output", () => {
    expect(parseSetsReps("8x 10x")).toEqual([
      { reps: "8", rest: DEFAULT_REST },
      { reps: "10", rest: DEFAULT_REST },
    ]);
  });
});

