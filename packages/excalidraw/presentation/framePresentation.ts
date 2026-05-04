import { arrayToMap, easeOut } from "@excalidraw/common";
import {
  getBoundTextElement,
  getContainerElement,
  getElementsVisibleInFrame,
  isFrameElement,
  isFrameLikeElement,
  isTextElement,
} from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawElement,
  ExcalidrawFrameElement,
  NonDeleted,
  NonDeletedElementsMap,
  NonDeletedSceneElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

export const PRESENTATION_CUSTOM_DATA_KEY = "storyplanePresentation";
export const PRESENTATION_METADATA_VERSION = 1 as const;
export const DEFAULT_PRESENTATION_TRANSITION_DURATION = 950;
export const MIN_PRESENTATION_TRANSITION_DURATION = 850;
export const MAX_PRESENTATION_TRANSITION_DURATION = 1800;
export const PRESENTATION_VIEWPORT_ZOOM_FACTOR = 0.86;
export const PRESENTATION_REVEAL_DURATION = 220;

export type StoryplanePresentationRevealEffect =
  | "fade"
  | "none"
  | "appear"
  | "disappear"
  | "fadeIn"
  | "fadeOut";

export type StoryplanePresentationReveal = {
  elementId: string;
  order: number;
  effect: StoryplanePresentationRevealEffect;
  durationMs?: number;
} & Record<string, any>;

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

export type PresentationRevealItem = {
  reveal: StoryplanePresentationReveal;
  element: NonDeletedExcalidrawElement | null;
  isValid: boolean;
  reason?: "duplicate" | "missing" | "moved";
};

export type PresentationRevealSelection = {
  frame: NonDeleted<ExcalidrawFrameElement>;
  elements: readonly NonDeletedExcalidrawElement[];
  elementIds: readonly ExcalidrawElement["id"][];
};

export type PresentationRevealPlaybackState = {
  active: boolean;
  currentFrameId: ExcalidrawElement["id"] | null;
  visibleRevealCount: number;
  revealAnimation: {
    elementId: ExcalidrawElement["id"];
    progress: number;
    durationMs: number;
  } | null;
};

export type PresentationRevealRemovalUpdate = {
  frame: NonDeleted<ExcalidrawFrameElement>;
  reveals: StoryplanePresentationReveal[];
};

type PresentationFrameGeometry = Pick<
  ExcalidrawFrameElement,
  "id" | "x" | "y" | "width" | "height"
>;
type PresentationElementsMap =
  | ElementsMap
  | NonDeletedElementsMap
  | NonDeletedSceneElementsMap;

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

const normalizeRevealEffect = (
  value: unknown,
): StoryplanePresentationRevealEffect => {
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
      return "fadeIn";
  }
};

const normalizePresentationReveals = (
  value: unknown,
): StoryplanePresentationReveal[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const reveals = value.flatMap((raw, index) => {
    if (!isRecord(raw) || typeof raw.elementId !== "string") {
      return [];
    }

    const durationMs = normalizeNonNegativeNumber(raw.durationMs);
    const reveal: StoryplanePresentationReveal = {
      ...raw,
      elementId: raw.elementId,
      order:
        normalizeFiniteNumber(raw.order) ?? Number.MAX_SAFE_INTEGER + index,
      effect: normalizeRevealEffect(raw.effect),
    };

    if (durationMs === undefined) {
      delete reveal.durationMs;
    } else {
      reveal.durationMs = durationMs;
    }

    if (!Number.isFinite(reveal.order)) {
      reveal.order = Number.MAX_SAFE_INTEGER + index;
    }

    return [reveal];
  });

  return reveals.length ? reveals : undefined;
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

  return {
    version: PRESENTATION_METADATA_VERSION,
    order: normalizeFiniteNumber(raw.order),
    title: normalizeTitle(raw.title),
    hidden: raw.hidden === true ? true : undefined,
    transition,
    reveals: normalizePresentationReveals(raw.reveals),
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
  const currentReveals = normalizePresentationReveals(
    currentPresentationData.reveals,
  );

  if (currentReveals) {
    nextPresentationData.reveals = currentReveals;
  }

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
    nextPresentationData.reveals =
      normalizePresentationReveals(updates.reveals) ?? [];
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

const getSortedPresentationReveals = (
  reveals: readonly StoryplanePresentationReveal[],
  elements: readonly ExcalidrawElement[] = [],
) => {
  const sceneOrder = new Map(
    elements.map((element, index) => [element.id, index] as const),
  );

  return [...reveals].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    const leftSceneOrder =
      sceneOrder.get(left.elementId) ?? Number.MAX_SAFE_INTEGER;
    const rightSceneOrder =
      sceneOrder.get(right.elementId) ?? Number.MAX_SAFE_INTEGER;

    if (leftSceneOrder !== rightSceneOrder) {
      return leftSceneOrder - rightSceneOrder;
    }

    return left.elementId.localeCompare(right.elementId);
  });
};

export const getPresentationReveals = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
  elements: readonly ExcalidrawElement[] = [],
) =>
  getSortedPresentationReveals(
    getFramePresentationData(frame)?.reveals ?? [],
    elements,
  );

export const normalizePresentationRevealOrder = (
  reveals: readonly StoryplanePresentationReveal[],
  elements: readonly ExcalidrawElement[] = [],
) =>
  getSortedPresentationReveals(reveals, elements).map((reveal, index) => ({
    ...reveal,
    order: index,
  }));

const writePresentationRevealOrder = (
  reveals: readonly StoryplanePresentationReveal[],
) =>
  reveals.map((reveal, index) => ({
    ...reveal,
    order: index,
  }));

export const getPresentationRevealPrimaryElement = (
  element: NonDeletedExcalidrawElement,
  elementsMap: PresentationElementsMap,
) => {
  const primaryElement =
    isTextElement(element) && element.containerId
      ? getContainerElement(element, elementsMap) ?? element
      : element;

  if (
    !primaryElement ||
    primaryElement.isDeleted ||
    isFrameLikeElement(primaryElement)
  ) {
    return null;
  }

  return primaryElement as NonDeletedExcalidrawElement;
};

export const getOwningPresentationFrame = (
  element: NonDeletedExcalidrawElement,
  elementsMap: PresentationElementsMap,
) => {
  const primaryElement = getPresentationRevealPrimaryElement(
    element,
    elementsMap,
  );

  if (!primaryElement) {
    return null;
  }

  let currentFrameId = primaryElement.frameId;
  const visitedFrameIds = new Set<ExcalidrawElement["id"]>();

  while (currentFrameId && !visitedFrameIds.has(currentFrameId)) {
    visitedFrameIds.add(currentFrameId);

    const frame = elementsMap.get(currentFrameId);
    if (!frame || frame.isDeleted) {
      return null;
    }

    if (isFrameElement(frame)) {
      return frame as NonDeleted<ExcalidrawFrameElement>;
    }

    currentFrameId = frame.frameId;
  }

  return null;
};

export const getPresentationRevealSelection = (
  selectedElements: readonly NonDeletedExcalidrawElement[],
  elementsMap: PresentationElementsMap,
): PresentationRevealSelection | null => {
  if (!selectedElements.length) {
    return null;
  }

  let frame: NonDeleted<ExcalidrawFrameElement> | null = null;
  const selectedRevealElements: NonDeletedExcalidrawElement[] = [];
  const seenElementIds = new Set<ExcalidrawElement["id"]>();

  for (const selectedElement of selectedElements) {
    const primaryElement = getPresentationRevealPrimaryElement(
      selectedElement,
      elementsMap,
    );

    if (!primaryElement) {
      return null;
    }

    const owningFrame = getOwningPresentationFrame(primaryElement, elementsMap);

    if (!owningFrame) {
      return null;
    }

    if (frame && owningFrame.id !== frame.id) {
      return null;
    }

    frame = owningFrame;

    if (!seenElementIds.has(primaryElement.id)) {
      seenElementIds.add(primaryElement.id);
      selectedRevealElements.push(primaryElement);
    }
  }

  return frame && selectedRevealElements.length
    ? {
        frame,
        elements: selectedRevealElements,
        elementIds: selectedRevealElements.map((element) => element.id),
      }
    : null;
};

export const getPresentationFrameRevealItems = (
  frame: NonDeleted<ExcalidrawFrameElement>,
  elements: readonly NonDeletedExcalidrawElement[],
  elementsMap: PresentationElementsMap = arrayToMap(elements),
): PresentationRevealItem[] => {
  const seenElementIds = new Set<ExcalidrawElement["id"]>();

  return getPresentationReveals(frame, elements).map((reveal) => {
    const rawElement = elementsMap.get(reveal.elementId);
    const element =
      rawElement && !rawElement.isDeleted
        ? getPresentationRevealPrimaryElement(
            rawElement as NonDeletedExcalidrawElement,
            elementsMap,
          )
        : null;

    if (!element) {
      return {
        reveal,
        element: null,
        isValid: false,
        reason: "missing",
      };
    }

    const isDuplicate = seenElementIds.has(element.id);
    seenElementIds.add(element.id);

    if (isDuplicate) {
      return {
        reveal,
        element,
        isValid: false,
        reason: "duplicate",
      };
    }

    const owningFrame = getOwningPresentationFrame(element, elementsMap);

    if (owningFrame?.id !== frame.id) {
      return {
        reveal,
        element,
        isValid: false,
        reason: "moved",
      };
    }

    return {
      reveal,
      element,
      isValid: true,
    };
  });
};

export const getPresentationFrameReveals = (
  frame: NonDeleted<ExcalidrawFrameElement>,
  elements: readonly NonDeletedExcalidrawElement[],
  elementsMap: PresentationElementsMap = arrayToMap(elements),
) =>
  getPresentationFrameRevealItems(frame, elements, elementsMap).filter(
    (
      item,
    ): item is PresentationRevealItem & {
      element: NonDeletedExcalidrawElement;
    } => item.isValid && !!item.element,
  );

export const appendPresentationReveals = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
  elementIds: readonly ExcalidrawElement["id"][],
  effect: StoryplanePresentationRevealEffect = "appear",
) => {
  const normalizedEffect = normalizeRevealEffect(effect);
  const currentReveals = getPresentationReveals(frame);
  const existingElementIds = new Set(
    currentReveals.map((reveal) => reveal.elementId),
  );
  let nextOrder =
    currentReveals.reduce(
      (maxOrder, reveal) =>
        Number.isFinite(reveal.order)
          ? Math.max(maxOrder, reveal.order)
          : maxOrder,
      -1,
    ) + 1;

  const nextReveals = [...currentReveals];

  for (const elementId of elementIds) {
    if (existingElementIds.has(elementId)) {
      continue;
    }

    existingElementIds.add(elementId);
    nextReveals.push({
      elementId,
      order: nextOrder,
      effect: normalizedEffect,
      durationMs: PRESENTATION_REVEAL_DURATION,
    });
    nextOrder++;
  }

  return writePresentationRevealOrder(nextReveals);
};

export const setPresentationRevealEffects = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
  elementIds: readonly ExcalidrawElement["id"][],
  effect: StoryplanePresentationRevealEffect,
) => {
  const normalizedEffect = normalizeRevealEffect(effect);
  const elementIdsToSet = new Set(elementIds);
  const updatedElementIds = new Set<ExcalidrawElement["id"]>();
  const currentReveals = getPresentationReveals(frame);
  const nextReveals = currentReveals.flatMap((reveal) => {
    if (!elementIdsToSet.has(reveal.elementId)) {
      return [reveal];
    }

    if (updatedElementIds.has(reveal.elementId)) {
      return [];
    }

    updatedElementIds.add(reveal.elementId);
    return [{ ...reveal, effect: normalizedEffect }];
  });
  let nextOrder =
    nextReveals.reduce(
      (maxOrder, reveal) =>
        Number.isFinite(reveal.order)
          ? Math.max(maxOrder, reveal.order)
          : maxOrder,
      -1,
    ) + 1;

  elementIds.forEach((elementId) => {
    if (updatedElementIds.has(elementId)) {
      return;
    }

    updatedElementIds.add(elementId);
    nextReveals.push({
      elementId,
      order: nextOrder,
      effect: normalizedEffect,
      durationMs: PRESENTATION_REVEAL_DURATION,
    });
    nextOrder++;
  });

  return writePresentationRevealOrder(nextReveals);
};

export const removePresentationReveals = (
  frame: Pick<ExcalidrawFrameElement, "customData">,
  elementIds: readonly ExcalidrawElement["id"][],
) => {
  const idsToRemove = new Set(elementIds);

  return normalizePresentationRevealOrder(
    getPresentationReveals(frame).filter(
      (reveal) => !idsToRemove.has(reveal.elementId),
    ),
  );
};

export const reorderPresentationReveals = (
  reveals: readonly StoryplanePresentationReveal[],
  elementId: ExcalidrawElement["id"],
  targetElementId: ExcalidrawElement["id"],
  position: PresentationFrameDropPosition = "before",
) => {
  if (elementId === targetElementId) {
    return normalizePresentationRevealOrder(reveals);
  }

  const orderedReveals = normalizePresentationRevealOrder(reveals);
  const sourceIndex = orderedReveals.findIndex(
    (reveal) => reveal.elementId === elementId,
  );
  const targetIndex = orderedReveals.findIndex(
    (reveal) => reveal.elementId === targetElementId,
  );

  if (sourceIndex < 0 || targetIndex < 0) {
    return orderedReveals;
  }

  const nextReveals = [...orderedReveals];
  const [movedReveal] = nextReveals.splice(sourceIndex, 1);
  const targetIndexInNext = nextReveals.findIndex(
    (reveal) => reveal.elementId === targetElementId,
  );

  if (targetIndexInNext < 0) {
    return orderedReveals;
  }

  nextReveals.splice(
    position === "after" ? targetIndexInNext + 1 : targetIndexInNext,
    0,
    movedReveal,
  );

  return writePresentationRevealOrder(nextReveals);
};

export const movePresentationReveal = (
  reveals: readonly StoryplanePresentationReveal[],
  elementId: ExcalidrawElement["id"],
  direction: -1 | 1,
) => {
  const orderedReveals = normalizePresentationRevealOrder(reveals);
  const currentIndex = orderedReveals.findIndex(
    (reveal) => reveal.elementId === elementId,
  );
  const targetIndex = currentIndex + direction;

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= orderedReveals.length ||
    currentIndex === targetIndex
  ) {
    return orderedReveals;
  }

  return reorderPresentationReveals(
    orderedReveals,
    elementId,
    orderedReveals[targetIndex].elementId,
    direction < 0 ? "before" : "after",
  );
};

export const getPresentationRevealRenderElementIds = (
  element: NonDeletedExcalidrawElement,
  elementsMap: PresentationElementsMap,
) => {
  const ids = new Set<ExcalidrawElement["id"]>([element.id]);
  const boundTextElement = getBoundTextElement(element, elementsMap);

  if (boundTextElement && !boundTextElement.isDeleted) {
    ids.add(boundTextElement.id);
  }

  return ids;
};

export const getPresentationRevealRemovalUpdatesForElements = (
  frames: readonly NonDeleted<ExcalidrawFrameElement>[],
  selectedElements: readonly NonDeletedExcalidrawElement[],
  elementsMap: PresentationElementsMap,
): PresentationRevealRemovalUpdate[] => {
  const elementIds = new Set<ExcalidrawElement["id"]>();

  for (const selectedElement of selectedElements) {
    const primaryElement = getPresentationRevealPrimaryElement(
      selectedElement,
      elementsMap,
    );

    if (!primaryElement) {
      continue;
    }

    getPresentationRevealRenderElementIds(primaryElement, elementsMap).forEach(
      (elementId) => elementIds.add(elementId),
    );
  }

  if (!elementIds.size) {
    return [];
  }

  return frames.flatMap((frame) => {
    const reveals = getPresentationReveals(frame);
    const nextReveals = reveals.filter(
      (reveal) => !elementIds.has(reveal.elementId),
    );

    return nextReveals.length === reveals.length
      ? []
      : [
          {
            frame,
            reveals: normalizePresentationRevealOrder(nextReveals),
          },
        ];
  });
};

export const getPresentationRevealRenderState = (
  elements: readonly NonDeletedExcalidrawElement[],
  presentationMode: PresentationRevealPlaybackState,
) => {
  const hiddenElementIds = new Set<ExcalidrawElement["id"]>();
  const opacityByElementId = new Map<ExcalidrawElement["id"], number>();

  if (!presentationMode.active || !presentationMode.currentFrameId) {
    return { hiddenElementIds, opacityByElementId };
  }

  const elementsMap = arrayToMap(elements);
  const currentFrame = elementsMap.get(presentationMode.currentFrameId);

  if (!currentFrame || !isFrameElement(currentFrame)) {
    return { hiddenElementIds, opacityByElementId };
  }

  const revealItems = getPresentationFrameReveals(
    currentFrame as NonDeleted<ExcalidrawFrameElement>,
    elements,
    elementsMap,
  );
  const visibleRevealCount = Math.max(
    0,
    Math.min(presentationMode.visibleRevealCount, revealItems.length),
  );

  const revealAnimation = presentationMode.revealAnimation;
  const animatedItem = revealAnimation
    ? revealItems.find(
        (item, index) =>
          index < visibleRevealCount &&
          (item.element.id === revealAnimation.elementId ||
            item.reveal.elementId === revealAnimation.elementId),
      )
    : null;

  revealItems.forEach((item, index) => {
    const hasReachedStep = index < visibleRevealCount;
    const isAnimating =
      animatedItem &&
      (animatedItem.element.id === item.element.id ||
        animatedItem.reveal.elementId === item.reveal.elementId);
    const isExitEffect =
      item.reveal.effect === "disappear" || item.reveal.effect === "fadeOut";
    const shouldHide = isExitEffect
      ? hasReachedStep && !isAnimating
      : !hasReachedStep;

    if (!shouldHide) {
      return;
    }

    getPresentationRevealRenderElementIds(item.element, elementsMap).forEach(
      (id) => hiddenElementIds.add(id),
    );
  });

  if (revealAnimation && animatedItem) {
    const progress = Number.isFinite(revealAnimation.progress)
      ? Math.max(0, Math.min(1, revealAnimation.progress))
      : 1;
    const opacityFactor =
      animatedItem.reveal.effect === "disappear" ||
      animatedItem.reveal.effect === "fadeOut"
        ? 1 - easeOut(progress)
        : easeOut(progress);

    if (opacityFactor < 1) {
      getPresentationRevealRenderElementIds(
        animatedItem.element,
        elementsMap,
      ).forEach((id) => opacityByElementId.set(id, opacityFactor));
    }
  }

  return { hiddenElementIds, opacityByElementId };
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
