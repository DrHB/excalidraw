import { arrayToMap } from "@excalidraw/common";
import {
  getBoundTextElement,
  getElementsVisibleInFrame,
  isFrameElement,
} from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawElement,
  ExcalidrawFrameElement,
  NonDeleted,
} from "@excalidraw/element/types";

export const PRESENTATION_CUSTOM_DATA_KEY = "storyplanePresentation";
export const PRESENTATION_METADATA_VERSION = 1 as const;
export const DEFAULT_PRESENTATION_TRANSITION_DURATION = 650;
export const DEFAULT_PRESENTATION_REVEAL_DURATION = 350;
export const PRESENTATION_VIEWPORT_ZOOM_FACTOR = 0.86;

export type PresentationRevealEffect =
  | "none"
  | "appear"
  | "disappear"
  | "fadeIn"
  | "fadeOut";

export type ActivePresentationRevealEffect = Exclude<
  PresentationRevealEffect,
  "none"
>;

export type StoryplanePresentationReveal = {
  elementId: string;
  order: number;
  effect: PresentationRevealEffect;
  durationMs?: number;
};

export type PresentationRevealAnimation = {
  frameId: ExcalidrawFrameElement["id"];
  order: number;
  direction: -1 | 1;
  durationMs: number;
  progress: number;
};

export type PresentationRevealStep = {
  order: number;
  reveals: Array<
    Omit<StoryplanePresentationReveal, "effect"> & {
      effect: ActivePresentationRevealEffect;
    }
  >;
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

const normalizeRevealEffect = (value: unknown): PresentationRevealEffect => {
  switch (value) {
    case "fade":
      return "fadeIn";
    case "appear":
    case "disappear":
    case "fadeIn":
    case "fadeOut":
    case "none":
      return value;
    default:
      return "none";
  }
};

const compactRevealOrders = (
  reveals: readonly StoryplanePresentationReveal[],
): StoryplanePresentationReveal[] => {
  const sortedOrders = Array.from(
    new Set(reveals.map((reveal) => reveal.order)),
  )
    .filter((order) => Number.isFinite(order))
    .sort((left, right) => left - right);
  const orderMap = new Map(
    sortedOrders.map((order, index) => [order, index] as const),
  );

  return reveals.map((reveal) => ({
    ...reveal,
    order: orderMap.get(reveal.order) ?? 0,
  }));
};

const normalizeReveals = (value: unknown): StoryplanePresentationReveal[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const reveals = value.flatMap((rawReveal, index) => {
    if (!isRecord(rawReveal) || typeof rawReveal.elementId !== "string") {
      return [];
    }

    const effect = normalizeRevealEffect(rawReveal.effect);

    if (effect === "none") {
      return [];
    }

    return [
      {
        elementId: rawReveal.elementId,
        order: normalizeFiniteNumber(rawReveal.order) ?? index,
        effect,
        durationMs: normalizeNonNegativeNumber(rawReveal.durationMs),
      },
    ];
  });

  return compactRevealOrders(reveals);
};

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
  const reveals = normalizeReveals(raw.reveals);

  return {
    version: PRESENTATION_METADATA_VERSION,
    order: normalizeFiniteNumber(raw.order),
    title: normalizeTitle(raw.title),
    hidden: raw.hidden === true ? true : undefined,
    transition,
    reveals: reveals.length ? reveals : undefined,
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
    const normalizedReveals = normalizeReveals(updates.reveals);
    nextPresentationData.reveals = normalizedReveals.length
      ? normalizedReveals
      : undefined;
  }

  return {
    ...currentCustomData,
    [PRESENTATION_CUSTOM_DATA_KEY]: nextPresentationData,
  };
};

export const updatePresentationFrameReveals = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
  elementIds: readonly ExcalidrawElement["id"][],
  effect: PresentationRevealEffect,
): StoryplanePresentationReveal[] | undefined => {
  const targetElementIds = Array.from(new Set(elementIds));

  if (!targetElementIds.length) {
    return getFramePresentationData(frame)?.reveals;
  }

  const targetElementIdSet = new Set(targetElementIds);
  const currentReveals = getFramePresentationData(frame)?.reveals ?? [];
  const targetRevealByElementId = new Map(
    currentReveals
      .filter((reveal) => targetElementIdSet.has(reveal.elementId))
      .map((reveal) => [reveal.elementId, reveal] as const),
  );
  const targetRevealOrders = new Set(
    targetElementIds.flatMap((elementId) => {
      const reveal = targetRevealByElementId.get(elementId);
      return reveal ? [reveal.order] : [];
    }),
  );
  const preservedReveals = currentReveals.filter(
    (reveal) => !targetElementIdSet.has(reveal.elementId),
  );

  if (effect === "none") {
    const nextReveals = compactRevealOrders(preservedReveals);
    return nextReveals.length ? nextReveals : undefined;
  }

  const nextOrder =
    targetRevealByElementId.size === targetElementIds.length &&
    targetRevealOrders.size === 1
      ? targetRevealOrders.values().next().value!
      : preservedReveals.length
      ? Math.max(...preservedReveals.map((reveal) => reveal.order)) + 1
      : 0;
  const nextReveals = compactRevealOrders([
    ...preservedReveals,
    ...targetElementIds.map((elementId) => ({
      elementId,
      order: nextOrder,
      effect,
      durationMs:
        effect === "fadeIn" || effect === "fadeOut"
          ? DEFAULT_PRESENTATION_REVEAL_DURATION
          : undefined,
    })),
  ]);

  return nextReveals.length ? nextReveals : undefined;
};

export const getPresentationRevealEffectForElements = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
  elementIds: readonly ExcalidrawElement["id"][],
): PresentationRevealEffect | null => {
  if (!elementIds.length) {
    return "none";
  }

  const revealByElementId = new Map(
    (getFramePresentationData(frame)?.reveals ?? []).map((reveal) => [
      reveal.elementId,
      reveal.effect,
    ]),
  );
  const effects = new Set(
    elementIds.map((elementId) => revealByElementId.get(elementId) ?? "none"),
  );

  return effects.size === 1 ? effects.values().next().value! : null;
};

export const getPresentationRevealSteps = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
): PresentationRevealStep[] => {
  const revealGroups = new Map<number, PresentationRevealStep["reveals"]>();

  for (const reveal of getFramePresentationData(frame)?.reveals ?? []) {
    if (reveal.effect === "none") {
      continue;
    }

    const reveals = revealGroups.get(reveal.order) ?? [];
    reveals.push({
      ...reveal,
      effect: reveal.effect,
    });
    revealGroups.set(reveal.order, reveals);
  }

  return Array.from(revealGroups.entries())
    .sort(([leftOrder], [rightOrder]) => leftOrder - rightOrder)
    .map(([order, reveals], index) => ({
      order: index,
      reveals: reveals.map((reveal) => ({ ...reveal, order: index })),
    }));
};

export const reorderPresentationFrameRevealSteps = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
  sourceOrder: number,
  targetOrder: number,
  position: PresentationFrameDropPosition = "before",
): StoryplanePresentationReveal[] | undefined => {
  if (sourceOrder === targetOrder) {
    return getFramePresentationData(frame)?.reveals;
  }

  const revealSteps = getPresentationRevealSteps(frame);
  const sourceIndex = revealSteps.findIndex(
    (step) => step.order === sourceOrder,
  );
  const targetIndex = revealSteps.findIndex(
    (step) => step.order === targetOrder,
  );

  if (sourceIndex < 0 || targetIndex < 0) {
    return getFramePresentationData(frame)?.reveals;
  }

  const nextRevealSteps = [...revealSteps];
  const [movedStep] = nextRevealSteps.splice(sourceIndex, 1);
  const targetIndexInNext = nextRevealSteps.findIndex(
    (step) => step.order === targetOrder,
  );

  if (!movedStep || targetIndexInNext < 0) {
    return getFramePresentationData(frame)?.reveals;
  }

  const insertionIndex =
    position === "after" ? targetIndexInNext + 1 : targetIndexInNext;

  nextRevealSteps.splice(insertionIndex, 0, movedStep);

  const nextReveals = nextRevealSteps.flatMap((step, order) =>
    step.reveals.map((reveal) => ({
      ...reveal,
      order,
    })),
  );

  return nextReveals.length ? nextReveals : undefined;
};

const isFadeRevealEffect = (effect: ActivePresentationRevealEffect) =>
  effect === "fadeIn" || effect === "fadeOut";

const isEntranceRevealEffect = (effect: ActivePresentationRevealEffect) =>
  effect === "appear" || effect === "fadeIn";

export const getPresentationElementOpacityMap = (
  frame: Pick<ExcalidrawFrameElement, "customData" | "id">,
  elementsMap: ElementsMap,
  presentationMode: {
    active: boolean;
    currentFrameId: ExcalidrawElement["id"] | null;
    currentRevealStep: number;
    revealAnimation: PresentationRevealAnimation | null;
  },
): Map<ExcalidrawElement["id"], number> | null => {
  if (
    !presentationMode.active ||
    presentationMode.currentFrameId !== frame.id
  ) {
    return null;
  }

  const revealSteps = getPresentationRevealSteps(frame);

  if (!revealSteps.length) {
    return null;
  }

  const opacityByElementId = new Map<ExcalidrawElement["id"], number>();
  const currentRevealStep = presentationMode.currentRevealStep;
  const animation =
    presentationMode.revealAnimation?.frameId === frame.id
      ? presentationMode.revealAnimation
      : null;

  for (const step of revealSteps) {
    for (const reveal of step.reveals) {
      const hasAppliedStep = step.order <= currentRevealStep;
      let opacity = isEntranceRevealEffect(reveal.effect)
        ? hasAppliedStep
          ? 1
          : 0
        : hasAppliedStep
        ? 0
        : 1;

      if (
        animation?.order === step.order &&
        isFadeRevealEffect(reveal.effect)
      ) {
        const progress = Math.min(Math.max(animation.progress, 0), 1);
        opacity =
          animation.direction > 0
            ? reveal.effect === "fadeIn"
              ? progress
              : 1 - progress
            : reveal.effect === "fadeIn"
            ? 1 - progress
            : progress;
      }

      if (opacity !== 1) {
        opacityByElementId.set(reveal.elementId, opacity);

        const element = elementsMap.get(reveal.elementId);
        const boundTextElement = element
          ? getBoundTextElement(element, elementsMap)
          : null;

        if (boundTextElement) {
          opacityByElementId.set(boundTextElement.id, opacity);
        }
      }
    }
  }

  return opacityByElementId.size ? opacityByElementId : null;
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
      getElementsVisibleInFrame(elements, frame, elementsMap)
        .map((element) => signatureByElementId.get(element.id)!)
        .join("|"),
    ]),
  );
};

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
  frame: Pick<ExcalidrawFrameElement, "customData">,
) =>
  getFramePresentationData(frame)?.transition?.durationMs ??
  DEFAULT_PRESENTATION_TRANSITION_DURATION;

export const getPresentationFrameTitle = (
  frame: Pick<ExcalidrawFrameElement, "customData" | "name">,
) => getFramePresentationData(frame)?.title ?? frame.name ?? null;
