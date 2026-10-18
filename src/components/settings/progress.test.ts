import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { advance, describeImport, describeProgress, LOOP_START, MAX_IDLE_ROUNDS, type LoopProgress } from "./progress";

describe("advance", () => {
  it("adds up processed links and stops when nothing remains", () => {
    let progress: LoopProgress = LOOP_START;
    const rounds = [
      { processed: 3, remaining: 4 },
      { processed: 3, remaining: 1 },
      { processed: 1, remaining: 0 },
    ];
    const outcomes: string[] = [];
    for (const round of rounds) {
      const step = advance(progress, round);
      progress = step.progress;
      outcomes.push(step.outcome);
    }
    assert.deepEqual(outcomes, ["continue", "continue", "done"]);
    assert.deepEqual(progress, { processed: 7, remaining: 0, idleRounds: 0 });
  });

  it("is done at once when the queue was already empty", () => {
    assert.equal(advance(LOOP_START, { processed: 0, remaining: 0 }).outcome, "done");
  });

  it("gives up after several rounds in which the queue does not shrink", () => {
    let progress: LoopProgress = advance(LOOP_START, { processed: 3, remaining: 5 }).progress;
    let outcome = "continue";
    let rounds = 0;
    while (outcome === "continue" && rounds < 20) {
      const step = advance(progress, { processed: 3, remaining: 5 });
      progress = step.progress;
      outcome = step.outcome;
      rounds++;
    }
    assert.equal(outcome, "stalled");
    assert.equal(rounds, MAX_IDLE_ROUNDS);
  });

  it("counts a round that processed nothing as idle", () => {
    const step = advance({ processed: 0, remaining: 2, idleRounds: 0 }, { processed: 0, remaining: 2 });
    assert.equal(step.progress.idleRounds, 1);
  });

  it("forgives a round where new links arrived, once the queue shrinks again", () => {
    let progress: LoopProgress = advance(LOOP_START, { processed: 3, remaining: 10 }).progress;
    progress = advance(progress, { processed: 3, remaining: 40 }).progress;
    assert.equal(progress.idleRounds, 1);
    progress = advance(progress, { processed: 3, remaining: 37 }).progress;
    assert.equal(progress.idleRounds, 0);
  });
});

describe("describeProgress", () => {
  it("shows the live count while running", () => {
    assert.equal(
      describeProgress({ phase: "running", origin: "pending", processed: 12, remaining: 34, stopping: false }),
      "Processed 12 · 34 remaining",
    );
    assert.equal(
      describeProgress({ phase: "running", origin: "import", processed: 1200, remaining: 3400, stopping: true }),
      "Processed 1,200 · 3,400 remaining · Stopping…",
    );
    assert.equal(
      describeProgress({ phase: "running", origin: "pending", processed: 0, remaining: null, stopping: false }),
      "Starting…",
    );
  });

  it("describes how a run ended", () => {
    assert.equal(describeProgress({ phase: "done", origin: "pending", processed: 46 }), "Done. 46 links processed.");
    assert.equal(describeProgress({ phase: "done", origin: "pending", processed: 1 }), "Done. 1 link processed.");
    assert.equal(describeProgress({ phase: "done", origin: "pending", processed: 0 }), "Nothing was waiting.");
    assert.equal(
      describeProgress({ phase: "stopped", origin: "pending", processed: 9, remaining: 20 }),
      "Stopped. Processed 9 · 20 remaining.",
    );
    assert.equal(
      describeProgress({ phase: "stalled", origin: "import", processed: 9, remaining: 1 }),
      "Processed 9. 1 link is still waiting; try again in a few minutes.",
    );
    assert.equal(
      describeProgress({ phase: "error", origin: "pending", processed: 0, message: "Couldn't do it." }),
      "Couldn't do it.",
    );
    assert.equal(
      describeProgress({ phase: "error", origin: "pending", processed: 6, message: "Couldn't do it." }),
      "Couldn't do it. Processed 6 before that.",
    );
  });
});

describe("describeImport", () => {
  it("lists only the counts that apply", () => {
    assert.equal(
      describeImport({ imported: 120, duplicates: 4, invalid: 2, skipped: 0 }),
      "Imported 120 · 4 already in your library · 2 rows without a usable link",
    );
    assert.equal(describeImport({ imported: 3, duplicates: 0, invalid: 0, skipped: 0 }), "Imported 3");
    assert.equal(
      describeImport({ imported: 0, duplicates: 12, invalid: 1, skipped: 0 }),
      "Imported 0 · 12 already in your library · 1 row without a usable link",
    );
    assert.equal(
      describeImport({ imported: 5000, duplicates: 0, invalid: 0, skipped: 250 }),
      "Imported 5,000 · 250 rows past the limit, not read",
    );
  });
});
