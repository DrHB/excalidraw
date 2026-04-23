import { newFrameElement } from "@excalidraw/element";

import {
  buildFramePresentationCustomData,
  collectPresentationFrames,
  getAdjacentPresentationFrame,
  getOrderedPresentationFrames,
  getVisiblePresentationFrames,
  isPresentationFrameHidden,
  movePresentationFrame,
  reorderPresentationFrames,
} from "./framePresentation";

const createFrame = (name?: string) =>
  newFrameElement({
    x: 0,
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
          reveals: [{ elementId: "el1", order: 0, effect: "fade" }],
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
      reveals: [{ elementId: "el1", order: 0, effect: "fade" }],
    });
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
});
