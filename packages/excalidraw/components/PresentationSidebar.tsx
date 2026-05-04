import clsx from "clsx";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_SIDEBAR,
  KEYS,
  PRESENTATION_SIDEBAR_TAB,
} from "@excalidraw/common";
import { selectGroupsForSelectedElements } from "@excalidraw/element";

import type {
  ExcalidrawFrameElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { useUIAppState } from "../context/ui-appState";
import { usePresentationFrameSvg } from "../hooks/usePresentationFrameSvg";
import { t } from "../i18n";
import {
  buildFramePresentationCustomData,
  DEFAULT_PRESENTATION_TRANSITION_DURATION,
  getPresentationFramePreviewSignatures,
  getOrderedPresentationFrames,
  getPresentationFrameDuration,
  getPresentationFrameTitle,
  getPresentationRevealSteps,
  getVisiblePresentationFrames,
  isPresentationFrameHidden,
  PRESENTATION_VIEWPORT_ZOOM_FACTOR,
  reorderPresentationFrames,
  reorderPresentationFrameRevealSteps,
  type PresentationRevealEffect,
  type PresentationRevealStep,
} from "../presentation/framePresentation";

import {
  useApp,
  useEditorInterface,
  useExcalidrawElements,
  useExcalidrawSetAppState,
} from "./App";
import { Button } from "./Button";
import { Sidebar } from "./Sidebar/Sidebar";
import { DotsIcon, eyeClosedIcon, eyeIcon, chevronRight } from "./icons";

import "./PresentationSidebar.scss";

import type { AppState } from "../types";

type PresentationFrame = NonDeleted<ExcalidrawFrameElement>;
type DropPosition = "before" | "after";
type FrameDropIndicator = {
  frameId: PresentationFrame["id"];
  position: DropPosition;
} | null;
type DraggedRevealStep = {
  frameId: PresentationFrame["id"];
  order: number;
} | null;
type RevealDropIndicator = {
  frameId: PresentationFrame["id"];
  order: number;
  position: DropPosition;
} | null;

const FRAME_DRAG_DATA_TYPE = "application/x-excalidraw-presentation-frame";
const REVEAL_DRAG_DATA_TYPE = "application/x-excalidraw-presentation-reveal";
const REVEAL_DRAG_PLAIN_PREFIX = "presentation-reveal:";

const getDropPosition = (
  event: React.DragEvent<HTMLDivElement>,
): DropPosition => {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY - bounds.top > bounds.height / 2 ? "after" : "before";
};

const getPresentationEffectLabel = (effect: PresentationRevealEffect) => {
  switch (effect) {
    case "appear":
      return t("presentation.effectAppear");
    case "disappear":
      return t("presentation.effectDisappear");
    case "fadeIn":
      return t("presentation.effectFadeIn");
    case "fadeOut":
      return t("presentation.effectFadeOut");
    case "none":
    default:
      return t("presentation.effectNone");
  }
};

const getRevealStepEffectLabel = (step: PresentationRevealStep) => {
  const effects = new Set(step.reveals.map((reveal) => reveal.effect));
  return effects.size === 1
    ? getPresentationEffectLabel(effects.values().next().value!)
    : t("presentation.effect");
};

const useVisibleInViewport = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(
    typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (isVisible || typeof IntersectionObserver === "undefined") {
      return;
    }

    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextEntry = entries[0];
        if (nextEntry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  return { ref, isVisible };
};

const PresentationFrameThumbnail = ({
  frame,
  elements,
  signature,
}: {
  frame: PresentationFrame;
  elements: readonly NonDeletedExcalidrawElement[];
  signature: string;
}) => {
  const app = useApp();
  const { ref, isVisible } = useVisibleInViewport();
  const svgRef = useRef<HTMLDivElement>(null);

  usePresentationFrameSvg({
    enabled: isVisible,
    elements,
    files: app.files,
    frame,
    ref: svgRef,
    signature,
  });

  return (
    <div className="PresentationSidebar__thumbnail" ref={ref}>
      <div className="PresentationSidebar__thumbnailCanvas" ref={svgRef} />
    </div>
  );
};

const PresentationSidebarRow = ({
  canDrag,
  elements,
  frame,
  index,
  isCurrent,
  isDropTarget,
  isDragging,
  isHidden,
  onCommitTitle,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onJumpToFrame,
  onRevealDragEnd,
  onRevealDragOver,
  onRevealDragStart,
  onRevealDrop,
  onToggleHidden,
  presentationActive,
  revealDropIndicator,
  revealSteps,
  signature,
}: {
  canDrag: boolean;
  elements: readonly NonDeletedExcalidrawElement[];
  frame: PresentationFrame;
  index: number;
  isCurrent: boolean;
  isDropTarget: FrameDropIndicator;
  isDragging: boolean;
  isHidden: boolean;
  onCommitTitle: (frame: PresentationFrame, title?: string) => void;
  onDragEnd: () => void;
  onDragOver: (
    event: React.DragEvent<HTMLDivElement>,
    frameId: PresentationFrame["id"],
  ) => void;
  onDragStart: (
    event: React.DragEvent<HTMLElement>,
    frameId: PresentationFrame["id"],
  ) => void;
  onDrop: (
    event: React.DragEvent<HTMLDivElement>,
    frameId: PresentationFrame["id"],
  ) => void;
  onJumpToFrame: (frame: PresentationFrame) => void;
  onRevealDragEnd: () => void;
  onRevealDragOver: (
    event: React.DragEvent<HTMLDivElement>,
    frameId: PresentationFrame["id"],
    order: number,
  ) => void;
  onRevealDragStart: (
    event: React.DragEvent<HTMLDivElement>,
    frameId: PresentationFrame["id"],
    order: number,
  ) => void;
  onRevealDrop: (
    event: React.DragEvent<HTMLDivElement>,
    frameId: PresentationFrame["id"],
    order: number,
  ) => void;
  onToggleHidden: (frame: PresentationFrame, hidden: boolean) => void;
  presentationActive: boolean;
  revealDropIndicator: RevealDropIndicator;
  revealSteps: PresentationRevealStep[];
  signature: string;
}) => {
  const derivedTitle = getPresentationFrameTitle(frame) ?? "";
  const [draftTitle, setDraftTitle] = useState(derivedTitle);

  useEffect(() => {
    setDraftTitle(derivedTitle);
  }, [derivedTitle]);

  const commitTitle = useCallback(() => {
    onCommitTitle(frame, draftTitle.trim() || undefined);
  }, [draftTitle, frame, onCommitTitle]);

  const stopPropagation = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <div
      className={clsx("PresentationSidebar__row", {
        "PresentationSidebar__row--current": isCurrent,
        "PresentationSidebar__row--dragging": isDragging,
        "PresentationSidebar__row--hidden": isHidden,
        "PresentationSidebar__row--dropBefore":
          isDropTarget?.frameId === frame.id &&
          isDropTarget.position === "before",
        "PresentationSidebar__row--dropAfter":
          isDropTarget?.frameId === frame.id &&
          isDropTarget.position === "after",
      })}
      data-testid={`presentation-frame-row-${frame.id}`}
      onClick={() => onJumpToFrame(frame)}
      onDragOver={(event) => onDragOver(event, frame.id)}
      onDrop={(event) => onDrop(event, frame.id)}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === KEYS.ENTER || event.key === KEYS.SPACE)
        ) {
          event.preventDefault();
          onJumpToFrame(frame);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="PresentationSidebar__order">{index + 1}</div>
      <PresentationFrameThumbnail
        elements={elements}
        frame={frame}
        signature={signature}
      />
      <div className="PresentationSidebar__content">
        <div className="PresentationSidebar__titleRow">
          <input
            className="PresentationSidebar__titleInput"
            data-testid={`presentation-title-${frame.id}`}
            onBlur={commitTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onClick={stopPropagation}
            onKeyDown={(event) => {
              if (event.key === KEYS.ENTER) {
                event.currentTarget.blur();
              }
              event.stopPropagation();
            }}
            placeholder={t("presentation.untitledFrame")}
            value={draftTitle}
          />
          {isHidden && (
            <span className="PresentationSidebar__hiddenTag">
              {t("presentation.hiddenTag")}
            </span>
          )}
        </div>
      </div>
      <div className="PresentationSidebar__actions" onClick={stopPropagation}>
        {canDrag && (
          <button
            aria-label={t("presentation.framePath")}
            className="excalidraw-button PresentationSidebar__iconButton PresentationSidebar__dragHandle"
            data-testid={`presentation-drag-${frame.id}`}
            draggable={true}
            onDragEnd={onDragEnd}
            onDragStart={(event) => onDragStart(event, frame.id)}
            title={t("presentation.framePath")}
            type="button"
          >
            {DotsIcon}
          </button>
        )}
        <Button
          aria-label={
            isHidden ? t("presentation.showFrame") : t("presentation.hideFrame")
          }
          className="PresentationSidebar__iconButton"
          data-testid={`presentation-toggle-hidden-${frame.id}`}
          onClick={stopPropagation}
          onSelect={() => onToggleHidden(frame, !isHidden)}
          title={
            isHidden ? t("presentation.showFrame") : t("presentation.hideFrame")
          }
        >
          {isHidden ? eyeClosedIcon : eyeIcon}
        </Button>
        <Button
          aria-label={t("presentation.jumpToFrame")}
          className="PresentationSidebar__iconButton"
          data-testid={`presentation-jump-${frame.id}`}
          disabled={presentationActive && isHidden}
          onClick={stopPropagation}
          onSelect={() => onJumpToFrame(frame)}
          title={t("presentation.jumpToFrame")}
        >
          {chevronRight}
        </Button>
      </div>
      {revealSteps.length > 0 && (
        <div
          className="PresentationSidebar__effects"
          data-testid={`presentation-effects-${frame.id}`}
          onClick={stopPropagation}
        >
          <div className="PresentationSidebar__effectsTitle">
            {t("presentation.effects")}
          </div>
          {revealSteps.map((step, stepIndex) => {
            const canDragStep = canDrag && revealSteps.length > 1;

            return (
              <div
                className={clsx("PresentationSidebar__effectRow", {
                  "PresentationSidebar__effectRow--dropBefore":
                    revealDropIndicator?.frameId === frame.id &&
                    revealDropIndicator.order === step.order &&
                    revealDropIndicator.position === "before",
                  "PresentationSidebar__effectRow--dropAfter":
                    revealDropIndicator?.frameId === frame.id &&
                    revealDropIndicator.order === step.order &&
                    revealDropIndicator.position === "after",
                })}
                data-testid={`presentation-effect-row-${frame.id}-${step.order}`}
                draggable={canDragStep}
                key={step.order}
                onDragEnd={onRevealDragEnd}
                onDragOver={(event) =>
                  onRevealDragOver(event, frame.id, step.order)
                }
                onDragStart={(event) =>
                  onRevealDragStart(event, frame.id, step.order)
                }
                onDrop={(event) => onRevealDrop(event, frame.id, step.order)}
              >
                {canDragStep && (
                  <span
                    aria-hidden={true}
                    className="PresentationSidebar__effectDragHandle"
                  >
                    {DotsIcon}
                  </span>
                )}
                <span className="PresentationSidebar__effectIndex">
                  {t("presentation.effectStep", { index: stepIndex + 1 })}
                </span>
                <span className="PresentationSidebar__effectName">
                  {getRevealStepEffectLabel(step)}
                </span>
                <span className="PresentationSidebar__effectCount">
                  {t("presentation.effectElementCount", {
                    count: step.reveals.length,
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const PresentationSidebar = memo(() => {
  const app = useApp();
  const appState = useUIAppState();
  const editorInterface = useEditorInterface();
  const elements = useExcalidrawElements();
  const setAppState = useExcalidrawSetAppState();

  const [draggedFrameId, setDraggedFrameId] = useState<
    PresentationFrame["id"] | null
  >(null);
  const [dropIndicator, setDropIndicator] = useState<FrameDropIndicator>(null);
  const [draggedRevealStep, setDraggedRevealStep] =
    useState<DraggedRevealStep>(null);
  const [revealDropIndicator, setRevealDropIndicator] =
    useState<RevealDropIndicator>(null);

  const orderedFrames = useMemo(
    () => getOrderedPresentationFrames(elements),
    [elements],
  );
  const visibleFrames = useMemo(
    () => getVisiblePresentationFrames(orderedFrames),
    [orderedFrames],
  );
  const previewSignatures = useMemo(
    () => getPresentationFramePreviewSignatures(elements),
    [elements],
  );
  const canDrag = editorInterface.formFactor !== "phone";
  const getDraggedFrameId = useCallback(
    (event: Pick<React.DragEvent, "dataTransfer">) => {
      const frameId =
        draggedFrameId ||
        event.dataTransfer.getData(FRAME_DRAG_DATA_TYPE) ||
        event.dataTransfer.getData("text/plain");

      return frameId && !frameId.startsWith(REVEAL_DRAG_PLAIN_PREFIX)
        ? (frameId as PresentationFrame["id"])
        : null;
    },
    [draggedFrameId],
  );
  const getDraggedRevealStep = useCallback(
    (event: Pick<React.DragEvent, "dataTransfer">): DraggedRevealStep => {
      if (draggedRevealStep) {
        return draggedRevealStep;
      }

      const serializedReveal = event.dataTransfer.getData(
        REVEAL_DRAG_DATA_TYPE,
      );

      if (serializedReveal) {
        try {
          const parsed = JSON.parse(serializedReveal);

          if (
            typeof parsed.frameId === "string" &&
            typeof parsed.order === "number"
          ) {
            return {
              frameId: parsed.frameId as PresentationFrame["id"],
              order: parsed.order,
            };
          }
        } catch {
          return null;
        }
      }

      const plainText = event.dataTransfer.getData("text/plain");

      if (plainText.startsWith(REVEAL_DRAG_PLAIN_PREFIX)) {
        const [, frameId, order] = plainText.split(":");
        const parsedOrder = Number(order);

        if (frameId && Number.isFinite(parsedOrder)) {
          return {
            frameId: frameId as PresentationFrame["id"],
            order: parsedOrder,
          };
        }
      }

      return null;
    },
    [draggedRevealStep],
  );

  const currentFrameId = appState.presentationMode.active
    ? appState.presentationMode.currentFrameId
    : Object.keys(appState.selectedElementIds)[0] ?? null;

  const focusEditor = useCallback(() => {
    window.setTimeout(() => {
      app.focusContainer();
    }, 0);
  }, [app]);

  const scrollToFrame = useCallback(
    (frame: PresentationFrame, animate = true) => {
      app.scrollToContent(frame, {
        animate,
        duration:
          getPresentationFrameDuration(frame) ??
          DEFAULT_PRESENTATION_TRANSITION_DURATION,
        fitToViewport: true,
        viewportZoomFactor: PRESENTATION_VIEWPORT_ZOOM_FACTOR,
      });
    },
    [app],
  );

  const setPresentationState = useCallback(
    (
      updates:
        | Partial<AppState["presentationMode"]>
        | ((
            state: AppState["presentationMode"],
          ) => Partial<AppState["presentationMode"]>),
    ) => {
      setAppState((state) => ({
        presentationMode: {
          ...state.presentationMode,
          ...(typeof updates === "function"
            ? updates(state.presentationMode)
            : updates),
        },
      }));
    },
    [setAppState],
  );

  const updateFrameMetadata = useCallback(
    (
      frame: PresentationFrame,
      updates: Parameters<typeof buildFramePresentationCustomData>[1],
      informMutation = true,
    ) => {
      app.scene.mutateElement(
        frame,
        {
          customData: buildFramePresentationCustomData(frame, updates),
        },
        { informMutation, isDragging: false },
      );
    },
    [app],
  );

  const applyFrameOrder = useCallback(
    (frames: readonly PresentationFrame[]) => {
      let didUpdate = false;

      frames.forEach((frame, index) => {
        if (frame.customData?.storyplanePresentation?.order === index) {
          return;
        }

        didUpdate = true;
        updateFrameMetadata(frame, { order: index }, false);
      });

      if (didUpdate) {
        app.scene.triggerUpdate();
      }
    },
    [app.scene, updateFrameMetadata],
  );

  const handleSelectFrame = useCallback(
    (frame: PresentationFrame) => {
      app.setActiveTool({ type: "selection" });
      setAppState((state) => ({
        activeEmbeddable: null,
        selectedLinearElement: null,
        ...selectGroupsForSelectedElements(
          {
            editingGroupId: null,
            selectedElementIds: { [frame.id]: true },
          },
          elements,
          state,
          app,
        ),
      }));
    },
    [app, elements, setAppState],
  );

  const handleJumpToFrame = useCallback(
    (frame: PresentationFrame) => {
      if (appState.presentationMode.active) {
        if (isPresentationFrameHidden(frame)) {
          return;
        }

        setPresentationState({ currentFrameId: frame.id });
        scrollToFrame(frame);
        focusEditor();
        return;
      }

      handleSelectFrame(frame);
      scrollToFrame(frame);
      focusEditor();
    },
    [
      appState.presentationMode.active,
      focusEditor,
      handleSelectFrame,
      scrollToFrame,
      setPresentationState,
    ],
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLElement>, frameId: PresentationFrame["id"]) => {
      event.dataTransfer.setData(FRAME_DRAG_DATA_TYPE, frameId);
      event.dataTransfer.setData("text/plain", frameId);
      setDraggedFrameId(frameId);
      setDropIndicator(null);
      setDraggedRevealStep(null);
      setRevealDropIndicator(null);
    },
    [],
  );

  const handleDragOver = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      frameId: PresentationFrame["id"],
    ) => {
      const activeDraggedFrameId = getDraggedFrameId(event);

      if (!activeDraggedFrameId || activeDraggedFrameId === frameId) {
        return;
      }

      event.preventDefault();
      const position = getDropPosition(event);

      setDraggedFrameId(activeDraggedFrameId);
      setDropIndicator({ frameId, position });
    },
    [getDraggedFrameId],
  );

  const handleDrop = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      frameId: PresentationFrame["id"],
    ) => {
      event.preventDefault();
      const activeDraggedFrameId = getDraggedFrameId(event);
      const position = getDropPosition(event);

      if (!activeDraggedFrameId || activeDraggedFrameId === frameId) {
        setDraggedFrameId(null);
        setDropIndicator(null);
        return;
      }

      applyFrameOrder(
        reorderPresentationFrames(
          orderedFrames,
          activeDraggedFrameId,
          frameId,
          position,
        ),
      );
      setDraggedFrameId(null);
      setDropIndicator(null);
    },
    [applyFrameOrder, getDraggedFrameId, orderedFrames],
  );

  const handleRevealDragStart = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      frameId: PresentationFrame["id"],
      order: number,
    ) => {
      event.stopPropagation();

      const payload = { frameId, order };
      event.dataTransfer.setData(
        REVEAL_DRAG_DATA_TYPE,
        JSON.stringify(payload),
      );
      event.dataTransfer.setData(
        "text/plain",
        `${REVEAL_DRAG_PLAIN_PREFIX}${frameId}:${order}`,
      );
      setDraggedRevealStep(payload);
      setRevealDropIndicator(null);
      setDraggedFrameId(null);
      setDropIndicator(null);
    },
    [],
  );

  const handleRevealDragOver = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      frameId: PresentationFrame["id"],
      order: number,
    ) => {
      event.stopPropagation();

      const activeRevealStep = getDraggedRevealStep(event);

      if (
        !activeRevealStep ||
        activeRevealStep.frameId !== frameId ||
        activeRevealStep.order === order
      ) {
        return;
      }

      event.preventDefault();
      setRevealDropIndicator({
        frameId,
        order,
        position: getDropPosition(event),
      });
    },
    [getDraggedRevealStep],
  );

  const handleRevealDrop = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      frameId: PresentationFrame["id"],
      order: number,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const activeRevealStep = getDraggedRevealStep(event);
      const targetFrame = orderedFrames.find((frame) => frame.id === frameId);

      if (
        activeRevealStep &&
        targetFrame &&
        activeRevealStep.frameId === frameId &&
        activeRevealStep.order !== order
      ) {
        updateFrameMetadata(targetFrame, {
          reveals: reorderPresentationFrameRevealSteps(
            targetFrame,
            activeRevealStep.order,
            order,
            getDropPosition(event),
          ),
        });
      }

      setDraggedRevealStep(null);
      setRevealDropIndicator(null);
    },
    [getDraggedRevealStep, orderedFrames, updateFrameMetadata],
  );

  const handleRevealDragEnd = useCallback(() => {
    setDraggedRevealStep(null);
    setRevealDropIndicator(null);
  }, []);

  const frameCountLabel = `${visibleFrames.length}/${orderedFrames.length}`;

  return (
    <Sidebar.Tab tab={PRESENTATION_SIDEBAR_TAB}>
      <div className="PresentationSidebar" data-testid="presentation-sidebar">
        <div className="PresentationSidebar__header">
          <div>
            <div className="PresentationSidebar__title">
              {t("presentation.sidebar")}
            </div>
            <div className="PresentationSidebar__description">
              {!orderedFrames.length
                ? t("presentation.noFrames")
                : !visibleFrames.length
                ? t("presentation.allFramesHidden")
                : t("presentation.pathHint")}
            </div>
          </div>
          {orderedFrames.length > 0 && (
            <div className="PresentationSidebar__count">{frameCountLabel}</div>
          )}
        </div>

        {!orderedFrames.length ? (
          <div className="PresentationSidebar__emptyState">
            {t("presentation.noFrames")}
          </div>
        ) : (
          <div className="PresentationSidebar__list">
            {orderedFrames.map((frame, index) => (
              <PresentationSidebarRow
                canDrag={canDrag}
                elements={elements}
                frame={frame}
                index={index}
                isCurrent={frame.id === currentFrameId}
                isDragging={draggedFrameId === frame.id}
                isDropTarget={dropIndicator}
                isHidden={isPresentationFrameHidden(frame)}
                key={frame.id}
                onCommitTitle={(targetFrame, title) =>
                  updateFrameMetadata(targetFrame, { title })
                }
                onDragEnd={() => {
                  setDraggedFrameId(null);
                  setDropIndicator(null);
                  setDraggedRevealStep(null);
                  setRevealDropIndicator(null);
                }}
                onDragOver={handleDragOver}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onJumpToFrame={handleJumpToFrame}
                onRevealDragEnd={handleRevealDragEnd}
                onRevealDragOver={handleRevealDragOver}
                onRevealDragStart={handleRevealDragStart}
                onRevealDrop={handleRevealDrop}
                onToggleHidden={(targetFrame, hidden) =>
                  updateFrameMetadata(targetFrame, { hidden })
                }
                presentationActive={appState.presentationMode.active}
                revealDropIndicator={revealDropIndicator}
                revealSteps={getPresentationRevealSteps(frame)}
                signature={previewSignatures.get(frame.id) ?? frame.id}
              />
            ))}
          </div>
        )}
      </div>
    </Sidebar.Tab>
  );
});

PresentationSidebar.displayName = "PresentationSidebar";

export const openPresentationSidebar = (
  setAppState: React.Component<any, AppState>["setState"],
) => {
  setAppState({
    openSidebar: {
      name: DEFAULT_SIDEBAR.name,
      tab: PRESENTATION_SIDEBAR_TAB,
    },
  });
};
