import { arrayToMap } from "@excalidraw/common";
import { getElementsVisibleInFrame, isFrameElement } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFrameElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

export const PRESENTATION_CUSTOM_DATA_KEY = "storyplanePresentation";
export const PRESENTATION_METADATA_VERSION = 1 as const;
export const DEFAULT_PRESENTATION_TRANSITION_DURATION = 950;
export const MIN_PRESENTATION_TRANSITION_DURATION = 850;
export const MAX_PRESENTATION_TRANSITION_DURATION = 1800;
export const PRESENTATION_VIEWPORT_ZOOM_FACTOR = 0.86;

export type StoryplanePresentationReveal = {
  elementId: string;
  order: number;
  effect: "fade" | "none";
  durationMs?: number;
};

export type StoryplanePresentationData = {
  version: typeof PRESENTATION_METADATA_VERSION;
  order?: number;
  title?: string;
  hidden?: boolean;
  transition?: {
    type: "panZoom";
    durationMs?: number;
  };
  reveals?: StoryplanePresentationReveal[];
};

export type StoryplanePresentationUpdate = {
  order?: number;
  title?: string;
  hidden?: boolean;
  transition?: Partial<StoryplanePresentationData["transition"]>;
  reveals?: StoryplanePresentationReveal[];
};

export type PresentationFrameDropPosition = "before" | "after";

type PresentationFrameGeometry = Pick<
  ExcalidrawFrameElement,
  "id" | "x" | "y" | "width" | "height"
>;

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeFiniteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const normalizeNonNegativeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const normalizeTitle = (value: unknown) =>
  typeof value === "string" ? value.trim() || undefined : undefined;

const getRawPresentationData = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
) => {
  const value = frame.customData?.[PRESENTATION_CUSTOM_DATA_KEY];
  return isRecord(value) ? value : null;
};

export const getFramePresentationData = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
): StoryplanePresentationData | null => {
  const raw = getRawPresentationData(frame);

  if (!raw) {
    return null;
  }

  const transition = isRecord(raw.transition)
    ? {
        type: "panZoom" as const,
        durationMs: normalizeNonNegativeNumber(raw.transition.durationMs),
      }
    : undefined;

  return {
    version: PRESENTATION_METADATA_VERSION,
    order: normalizeFiniteNumber(raw.order),
    title: normalizeTitle(raw.title),
    hidden: raw.hidden === true ? true : undefined,
    transition,
    reveals: Array.isArray(raw.reveals)
      ? (raw.reveals as StoryplanePresentationReveal[])
      : undefined,
  };
};

export const buildFramePresentationCustomData = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
  updates: StoryplanePresentationUpdate,
): Record<string, any> => {
  const currentCustomData = isRecord(frame.customData) ? frame.customData : {};
  const currentPresentationData = getRawPresentationData(frame) ?? {};
  const nextPresentationData: Record<string, any> = {
    ...currentPresentationData,
    version: PRESENTATION_METADATA_VERSION,
  };

  if ("order" in updates) {
    nextPresentationData.order = normalizeFiniteNumber(updates.order);
  }

  if ("title" in updates) {
    nextPresentationData.title = normalizeTitle(updates.title);
  }

  if ("hidden" in updates) {
    nextPresentationData.hidden = updates.hidden === true ? true : undefined;
  }

  if ("transition" in updates) {
    if (updates.transition) {
      const nextTransition = {
        ...(isRecord(currentPresentationData.transition)
          ? currentPresentationData.transition
          : {}),
        ...updates.transition,
        type: "panZoom" as const,
      };
      nextTransition.durationMs = normalizeNonNegativeNumber(
        nextTransition.durationMs,
      );
      nextPresentationData.transition = nextTransition;
    } else {
      nextPresentationData.transition = undefined;
    }
  }

  if ("reveals" in updates) {
    nextPresentationData.reveals = Array.isArray(updates.reveals)
      ? updates.reveals
      : undefined;
  }

  return {
    ...currentCustomData,
    [PRESENTATION_CUSTOM_DATA_KEY]: nextPresentationData,
  };
};

export const collectPresentationFrames = (
  elements: readonly ExcalidrawElement[],
) =>
  elements.filter(
    (element): element is NonDeleted<ExcalidrawFrameElement> =>
      !element.isDeleted && isFrameElement(element),
  );

export const sortPresentationFrames = (
  frames: readonly NonDeleted<ExcalidrawFrameElement>[],
  elements: readonly ExcalidrawElement[],
) => {
  const sceneOrder = new Map(
    elements.map((element, index) => [element.id, index] as const),
  );

  return [...frames].sort((left, right) => {
    const leftOrder =
      getFramePresentationData(left)?.order ?? Number.POSITIVE_INFINITY;
    const rightOrder =
      getFramePresentationData(right)?.order ?? Number.POSITIVE_INFINITY;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    const leftSceneOrder = sceneOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightSceneOrder = sceneOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;

    if (leftSceneOrder !== rightSceneOrder) {
      return leftSceneOrder - rightSceneOrder;
    }

    return left.id.localeCompare(right.id);
  });
};

export const getOrderedPresentationFrames = (
  elements: readonly ExcalidrawElement[],
) => sortPresentationFrames(collectPresentationFrames(elements), elements);

export const getPresentationFramePreviewSignatures = (
  elements: readonly ExcalidrawElement[],
) => {
  const elementsMap = arrayToMap(elements);
  const signatureByElementId = new Map(
    elements.map((element, index) => [
      element.id,
      `${index}:${element.id}:${element.version}:${element.versionNonce}`,
    ]),
  );

  return new Map(
    collectPresentationFrames(elements).map((frame) => [
      frame.id,
      getPresentationFramePreviewElements(elements, frame, elementsMap)
        .map((element) => signatureByElementId.get(element.id)!)
        .join("|"),
    ]),
  );
};

export const getPresentationFramePreviewElements = (
  elements: readonly ExcalidrawElement[],
  frame: NonDeleted<ExcalidrawFrameElement>,
  elementsMap = arrayToMap(elements),
) =>
  getElementsVisibleInFrame(
    elements,
    frame,
    elementsMap,
  ) as NonDeletedExcalidrawElement[];

export const reorderPresentationFrames = (
  frames: readonly NonDeleted<ExcalidrawFrameElement>[],
  frameId: ExcalidrawFrameElement["id"],
  targetFrameId: ExcalidrawFrameElement["id"],
  position: PresentationFrameDropPosition = "before",
) => {
  if (frameId === targetFrameId) {
    return [...frames];
  }

  const sourceIndex = frames.findIndex((frame) => frame.id === frameId);
  const targetIndex = frames.findIndex((frame) => frame.id === targetFrameId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return [...frames];
  }

  const nextFrames = [...frames];
  const [movedFrame] = nextFrames.splice(sourceIndex, 1);
  const targetIndexInNext = nextFrames.findIndex(
    (frame) => frame.id === targetFrameId,
  );

  if (targetIndexInNext < 0) {
    return [...frames];
  }

  const insertionIndex =
    position === "after" ? targetIndexInNext + 1 : targetIndexInNext;

  nextFrames.splice(insertionIndex, 0, movedFrame);
  return nextFrames;
};

export const movePresentationFrame = (
  frames: readonly NonDeleted<ExcalidrawFrameElement>[],
  frameId: ExcalidrawFrameElement["id"],
  direction: -1 | 1,
) => {
  const currentIndex = frames.findIndex((frame) => frame.id === frameId);
  const targetIndex = currentIndex + direction;

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= frames.length ||
    currentIndex === targetIndex
  ) {
    return [...frames];
  }

  return reorderPresentationFrames(
    frames,
    frameId,
    frames[targetIndex].id,
    direction < 0 ? "before" : "after",
  );
};

export const isPresentationFrameHidden = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
) => getFramePresentationData(frame)?.hidden === true;

export const getVisiblePresentationFrames = (
  frames: readonly NonDeleted<ExcalidrawFrameElement>[],
) => frames.filter((frame) => !isPresentationFrameHidden(frame));

export const getAdjacentPresentationFrame = (
  frames: readonly NonDeleted<ExcalidrawFrameElement>[],
  currentFrameId: ExcalidrawFrameElement["id"] | null,
  direction: -1 | 1,
) => {
  const step = direction < 0 ? -1 : 1;
  let index =
    currentFrameId == null
      ? step > 0
        ? -1
        : frames.length
      : frames.findIndex((frame) => frame.id === currentFrameId);

  if (index < 0) {
    index = step > 0 ? -1 : frames.length;
  }

  for (
    let nextIndex = index + step;
    nextIndex >= 0 && nextIndex < frames.length;
    nextIndex += step
  ) {
    const frame = frames[nextIndex];
    if (!isPresentationFrameHidden(frame)) {
      return frame;
    }
  }

  return null;
};

export const getPresentationFrameDuration = (
  frame: Pick<ExcalidrawFrameElement, "customData"> & PresentationFrameGeometry,
  previousFrame?: PresentationFrameGeometry | null,
) => {
  const customDuration =
    getFramePresentationData(frame)?.transition?.durationMs;

  if (customDuration !== undefined) {
    return customDuration;
  }

  if (!previousFrame || previousFrame.id === frame.id) {
    return DEFAULT_PRESENTATION_TRANSITION_DURATION;
  }

  return getAdaptivePresentationFrameDuration(previousFrame, frame);
};

export const getAdaptivePresentationFrameDuration = (
  previousFrame: PresentationFrameGeometry,
  nextFrame: PresentationFrameGeometry,
) => {
  const previousCenterX = previousFrame.x + previousFrame.width / 2;
  const previousCenterY = previousFrame.y + previousFrame.height / 2;
  const nextCenterX = nextFrame.x + nextFrame.width / 2;
  const nextCenterY = nextFrame.y + nextFrame.height / 2;
  const centerDistance = Math.hypot(
    nextCenterX - previousCenterX,
    nextCenterY - previousCenterY,
  );
  const previousDiagonal = Math.hypot(
    previousFrame.width,
    previousFrame.height,
  );
  const nextDiagonal = Math.hypot(nextFrame.width, nextFrame.height);
  const averageDiagonal = Math.max((previousDiagonal + nextDiagonal) / 2, 1);
  const distanceFactor = Math.min(centerDistance / averageDiagonal, 2.25);
  const scaleFactor = Math.min(
    Math.abs(
      Math.log(Math.max(nextDiagonal, 1) / Math.max(previousDiagonal, 1)),
    ),
    1.5,
  );
  const duration =
    MIN_PRESENTATION_TRANSITION_DURATION +
    distanceFactor * 300 +
    scaleFactor * 220;

  return (
    Math.round(Math.min(MAX_PRESENTATION_TRANSITION_DURATION, duration) / 50) *
    50
  );
};

export const getPresentationFrameTitle = (
  frame: Pick<ExcalidrawFrameElement, "customData" | "name">,
) => getFramePresentationData(frame)?.title ?? frame.name ?? null;

export const getDefaultPresentationFrameLabel = (index: number) =>
  `${index + 1}`;

export const getPresentationFrameLabel = (
  frame: Pick<ExcalidrawFrameElement, "customData" | "name">,
  index: number,
) =>
  getPresentationFrameTitle(frame) ?? getDefaultPresentationFrameLabel(index);
