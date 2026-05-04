import { arrayToMap } from "@excalidraw/common";
import { newElement, newFrameElement } from "@excalidraw/element";

import {
  buildFramePresentationCustomData,
  collectPresentationFrames,
  getAdjacentPresentationFrame,
  getFramePresentationData,
  getOrderedPresentationFrames,
  getPresentationElementOpacityMap,
  getPresentationFramePreviewSignatures,
  getPresentationRevealEffectForElements,
  getPresentationRevealSteps,
  getVisiblePresentationFrames,
  isPresentationFrameHidden,
  movePresentationFrame,
  reorderPresentationFrameRevealSteps,
  reorderPresentationFrames,
  updatePresentationFrameReveals,
} from "./framePresentation";

const createFrame = (name?: string, x = 0) =>
  newFrameElement({
    x,
    y: 0,
    width: 200,
    height: 120,
    name,
  });

const withPresentationData = (
  frame: ReturnType<typeof createFrame>,
  updates: Parameters<typeof buildFramePresentationCustomData>[1],
) => ({
  ...frame,
  customData: buildFramePresentationCustomData(frame, updates),
});

describe("framePresentation helpers", () => {
  it("sorts frames by explicit order with scene-order fallback", () => {
    const frameA = withPresentationData(createFrame("A"), { order: 2 });
    const frameB = withPresentationData(createFrame("B"), { order: 1 });
    const frameC = createFrame("C");

    const orderedFrames = getOrderedPresentationFrames([
      frameC,
      frameA,
      frameB,
    ]);

    expect(orderedFrames.map((frame) => frame.id)).toEqual([
      frameB.id,
      frameA.id,
      frameC.id,
    ]);
  });

  it("uses scene order when metadata order is duplicated or missing", () => {
    const frameA = withPresentationData(createFrame("A"), { order: 0 });
    const frameB = withPresentationData(createFrame("B"), { order: 0 });
    const frameC = createFrame("C");

    const orderedFrames = getOrderedPresentationFrames([
      frameB,
      frameA,
      frameC,
    ]);

    expect(orderedFrames.map((frame) => frame.id)).toEqual([
      frameB.id,
      frameA.id,
      frameC.id,
    ]);
  });

  it("skips hidden frames when navigating", () => {
    const frameA = withPresentationData(createFrame("A"), { order: 0 });
    const frameB = withPresentationData(createFrame("B"), {
      order: 1,
      hidden: true,
    });
    const frameC = withPresentationData(createFrame("C"), { order: 2 });

    const orderedFrames = getOrderedPresentationFrames([
      frameA,
      frameB,
      frameC,
    ]);

    expect(isPresentationFrameHidden(frameB)).toBe(true);
    expect(
      getVisiblePresentationFrames(orderedFrames).map((frame) => frame.id),
    ).toEqual([frameA.id, frameC.id]);
    expect(getAdjacentPresentationFrame(orderedFrames, frameA.id, 1)?.id).toBe(
      frameC.id,
    );
  });

  it("omits deleted frames from the collected path", () => {
    const liveFrame = createFrame("Live");
    const deletedFrame = createFrame("Deleted");

    deletedFrame.isDeleted = true;

    expect(
      collectPresentationFrames([liveFrame, deletedFrame]).map(
        (frame) => frame.id,
      ),
    ).toEqual([liveFrame.id]);
  });

  it("preserves unrelated customData fields when updating presentation metadata", () => {
    const frame = createFrame("Intro");
    const frameWithCustomData = {
      ...frame,
      customData: {
        unrelated: { keep: true },
        storyplanePresentation: {
          version: 1,
          reveals: [{ elementId: "el1", order: 0, effect: "fadeIn" }],
        },
      },
    };

    const nextCustomData = buildFramePresentationCustomData(
      frameWithCustomData,
      {
        order: 3,
        hidden: true,
        title: "Scene 1",
      },
    );

    expect(nextCustomData.unrelated).toEqual({ keep: true });
    expect(nextCustomData.storyplanePresentation).toMatchObject({
      version: 1,
      order: 3,
      hidden: true,
      title: "Scene 1",
      reveals: [{ elementId: "el1", order: 0, effect: "fadeIn" }],
    });
  });

  it("normalizes legacy and invalid reveal effects", () => {
    const frame = {
      ...createFrame("Intro"),
      customData: {
        storyplanePresentation: {
          version: 1,
          reveals: [
            { elementId: "a", order: 3, effect: "fade" },
            { elementId: "b", order: 8, effect: "none" },
            { elementId: "c", order: 10, effect: "unknown" },
          ],
        },
      },
    };

    expect(getFramePresentationData(frame)?.reveals).toEqual([
      { elementId: "a", order: 0, effect: "fadeIn", durationMs: undefined },
    ]);
  });

  it("adds, replaces, and removes selected element reveal effects", () => {
    const frame = createFrame("Effects");
    const initialReveals = updatePresentationFrameReveals(
      frame,
      ["a", "b"],
      "appear",
    );
    const frameWithInitialReveals = withPresentationData(frame, {
      reveals: initialReveals,
    });

    expect(initialReveals).toEqual([
      { elementId: "a", order: 0, effect: "appear", durationMs: undefined },
      { elementId: "b", order: 0, effect: "appear", durationMs: undefined },
    ]);
    expect(
      getPresentationRevealEffectForElements(frameWithInitialReveals, [
        "a",
        "b",
      ]),
    ).toBe("appear");

    const replacedReveals = updatePresentationFrameReveals(
      frameWithInitialReveals,
      ["a"],
      "fadeOut",
    );
    const frameWithReplacedReveal = withPresentationData(frame, {
      reveals: replacedReveals,
    });

    expect(getPresentationRevealSteps(frameWithReplacedReveal)).toMatchObject([
      {
        order: 0,
        reveals: [
          { elementId: "b", effect: "appear" },
          { elementId: "a", effect: "fadeOut" },
        ],
      },
    ]);
    expect(
      updatePresentationFrameReveals(frameWithReplacedReveal, ["a"], "none"),
    ).toEqual([
      { elementId: "b", order: 0, effect: "appear", durationMs: undefined },
    ]);
    expect(
      updatePresentationFrameReveals(
        frameWithInitialReveals,
        ["a", "b"],
        "none",
      ),
    ).toBeUndefined();
  });

  it("reorders reveal steps while preserving grouped effects", () => {
    const frame = withPresentationData(createFrame("Effects"), {
      reveals: [
        { elementId: "a", order: 0, effect: "appear" },
        { elementId: "b", order: 0, effect: "appear" },
        { elementId: "c", order: 1, effect: "fadeIn" },
      ],
    });

    expect(reorderPresentationFrameRevealSteps(frame, 1, 0, "before")).toEqual([
      { elementId: "c", order: 0, effect: "fadeIn", durationMs: undefined },
      { elementId: "a", order: 1, effect: "appear", durationMs: undefined },
      { elementId: "b", order: 1, effect: "appear", durationMs: undefined },
    ]);
  });

  it("computes render opacity for reveal playback without mutating elements", () => {
    const frame = withPresentationData(createFrame("Opacity"), {
      reveals: [
        { elementId: "appear", order: 0, effect: "appear" },
        { elementId: "fade", order: 1, effect: "fadeIn", durationMs: 100 },
        { elementId: "disappear", order: 2, effect: "disappear" },
      ],
    });
    const appearElement = {
      ...newElement({
        type: "rectangle",
        x: 20,
        y: 20,
        width: 40,
        height: 40,
        frameId: frame.id,
      }),
      id: "appear",
    };
    const fadeElement = {
      ...newElement({
        type: "rectangle",
        x: 80,
        y: 20,
        width: 40,
        height: 40,
        frameId: frame.id,
      }),
      id: "fade",
    };
    const disappearElement = {
      ...newElement({
        type: "rectangle",
        x: 140,
        y: 20,
        width: 40,
        height: 40,
        frameId: frame.id,
      }),
      id: "disappear",
    };
    const elementsMap = arrayToMap([
      frame,
      appearElement,
      fadeElement,
      disappearElement,
    ]);

    expect(
      getPresentationElementOpacityMap(frame, elementsMap, {
        active: true,
        currentFrameId: frame.id,
        currentRevealStep: -1,
        revealAnimation: null,
      }),
    ).toEqual(
      new Map([
        ["appear", 0],
        ["fade", 0],
      ]),
    );

    expect(
      getPresentationElementOpacityMap(frame, elementsMap, {
        active: true,
        currentFrameId: frame.id,
        currentRevealStep: 1,
        revealAnimation: {
          frameId: frame.id,
          order: 1,
          direction: 1,
          durationMs: 100,
          progress: 0.4,
        },
      })?.get("fade"),
    ).toBe(0.4);

    expect(
      getPresentationElementOpacityMap(frame, elementsMap, {
        active: true,
        currentFrameId: frame.id,
        currentRevealStep: 2,
        revealAnimation: null,
      })?.get("disappear"),
    ).toBe(0);
    expect(appearElement.opacity).toBe(100);
  });

  it("reorders frames deterministically for drag-and-drop", () => {
    const frameA = withPresentationData(createFrame("A"), { order: 0 });
    const frameB = withPresentationData(createFrame("B"), { order: 1 });
    const frameC = withPresentationData(createFrame("C"), { order: 2 });

    const reorderedFrames = reorderPresentationFrames(
      [frameA, frameB, frameC],
      frameA.id,
      frameC.id,
      "after",
    );

    expect(reorderedFrames.map((frame) => frame.id)).toEqual([
      frameB.id,
      frameC.id,
      frameA.id,
    ]);
  });

  it("moves frames by one slot for keyboard/button fallback reorder", () => {
    const frameA = withPresentationData(createFrame("A"), { order: 0 });
    const frameB = withPresentationData(createFrame("B"), { order: 1 });
    const frameC = withPresentationData(createFrame("C"), { order: 2 });

    const reorderedFrames = movePresentationFrame(
      [frameA, frameB, frameC],
      frameB.id,
      1,
    );

    expect(reorderedFrames.map((frame) => frame.id)).toEqual([
      frameA.id,
      frameC.id,
      frameB.id,
    ]);
  });

  it("builds preview signatures from the same overlapping elements used by export", () => {
    const frame = createFrame("Preview");
    const otherFrame = createFrame("Other", 320);

    const unboundOverlappingRect = newElement({
      type: "rectangle",
      x: 24,
      y: 24,
      width: 80,
      height: 48,
    });
    const boundOverlappingRect = newElement({
      type: "rectangle",
      x: 40,
      y: 40,
      width: 60,
      height: 36,
      frameId: otherFrame.id,
    });
    const outsideRect = newElement({
      type: "rectangle",
      x: 520,
      y: 520,
      width: 40,
      height: 24,
    });

    const previewSignatures = getPresentationFramePreviewSignatures([
      frame,
      otherFrame,
      unboundOverlappingRect,
      boundOverlappingRect,
      outsideRect,
    ]);

    expect(previewSignatures.get(frame.id)).toContain(
      unboundOverlappingRect.id,
    );
    expect(previewSignatures.get(frame.id)).not.toContain(
      boundOverlappingRect.id,
    );
    expect(previewSignatures.get(frame.id)).not.toContain(outsideRect.id);
  });

  it("includes nested frame descendants in preview signatures", () => {
    const outerFrame = createFrame("Outer");
    const innerFrame = newFrameElement({
      x: 32,
      y: 28,
      width: 140,
      height: 100,
      frameId: outerFrame.id,
      name: "Inner",
    });
    const innerFrameChild = newElement({
      type: "rectangle",
      x: 48,
      y: 52,
      width: 80,
      height: 48,
      frameId: innerFrame.id,
    });
    const outerFrameOverlap = newElement({
      type: "rectangle",
      x: 20,
      y: 20,
      width: 120,
      height: 64,
      frameId: outerFrame.id,
    });

    const previewSignatures = getPresentationFramePreviewSignatures([
      outerFrame,
      innerFrame,
      innerFrameChild,
      outerFrameOverlap,
    ]);

    expect(previewSignatures.get(outerFrame.id)).toContain(innerFrameChild.id);
    expect(previewSignatures.get(innerFrame.id)).toContain(innerFrameChild.id);
    expect(previewSignatures.get(innerFrame.id)).not.toContain(
      outerFrameOverlap.id,
    );
  });
});
