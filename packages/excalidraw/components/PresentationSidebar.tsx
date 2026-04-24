import clsx from "clsx";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_SIDEBAR,
  KEYS,
  PRESENTATION_SIDEBAR_TAB,
  THEME,
} from "@excalidraw/common";
import {
  isFrameElement,
  selectGroupsForSelectedElements,
} from "@excalidraw/element";

import type {
  ExcalidrawFrameElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { t } from "../i18n";
import { usePresentationFrameSvg } from "../hooks/usePresentationFrameSvg";
import {
  buildFramePresentationCustomData,
  getFramePresentationData,
  getPresentationFrameReveals,
  getPresentationFramePreviewSignatures,
  getOrderedPresentationFrames,
  getPresentationFrameDuration,
  getPresentationFrameTitle,
  getPresentationReveals,
  getVisiblePresentationFrames,
  isPresentationFrameHidden,
  movePresentationReveal,
  PRESENTATION_VIEWPORT_ZOOM_FACTOR,
  reorderPresentationFrames,
  reorderPresentationReveals,
  removePresentationReveals,
} from "../presentation/framePresentation";
import { useUIAppState } from "../context/ui-appState";

import {
  useApp,
  useEditorInterface,
  useExcalidrawElements,
  useExcalidrawSetAppState,
} from "./App";
import { Button } from "./Button";
import { Sidebar } from "./Sidebar/Sidebar";
import {
  collapseDownIcon,
  collapseUpIcon,
  DotsIcon,
  eyeClosedIcon,
  eyeIcon,
  chevronRight,
  TrashIcon,
} from "./icons";

import "./PresentationSidebar.scss";

import type { AppState } from "../types";

type PresentationFrame = NonDeleted<ExcalidrawFrameElement>;
type DropPosition = "before" | "after";
type DropIndicator = {
  frameId: PresentationFrame["id"];
  position: DropPosition;
} | null;
type DraggedReveal = {
  frameId: PresentationFrame["id"];
  elementId: NonDeletedExcalidrawElement["id"];
} | null;
type RevealDropIndicator = {
  frameId: PresentationFrame["id"];
  elementId: NonDeletedExcalidrawElement["id"];
  position: DropPosition;
} | null;

const PRESENTATION_REVEAL_DRAG_MIME = "application/x-storyplane-reveal";

const getDropPosition = (
  event: React.DragEvent<HTMLDivElement>,
): DropPosition => {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY - bounds.top > bounds.height / 2 ? "after" : "before";
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
  exportWithDarkMode,
  signature,
  viewBackgroundColor,
}: {
  frame: PresentationFrame;
  elements: readonly NonDeletedExcalidrawElement[];
  exportWithDarkMode: boolean;
  signature: string;
  viewBackgroundColor: AppState["viewBackgroundColor"];
}) => {
  const app = useApp();
  const { ref, isVisible } = useVisibleInViewport();
  const svgRef = useRef<HTMLDivElement>(null);

  usePresentationFrameSvg({
    enabled: isVisible,
    elements,
    exportWithDarkMode,
    files: app.files,
    frame,
    ref: svgRef,
    signature,
    viewBackgroundColor,
  });

  return (
    <div className="PresentationSidebar__thumbnail" ref={ref}>
      <div className="PresentationSidebar__thumbnailCanvas" ref={svgRef} />
    </div>
  );
};

const PresentationSidebarRow = ({
  canDrag,
  draggedReveal,
  elements,
  exportWithDarkMode,
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
  onMoveReveal,
  onRemoveReveal,
  onRevealDragEnd,
  onRevealDragOver,
  onRevealDragStart,
  onRevealDrop,
  onToggleHidden,
  presentationActive,
  revealDropIndicator,
  signature,
  viewBackgroundColor,
}: {
  canDrag: boolean;
  draggedReveal: DraggedReveal;
  elements: readonly NonDeletedExcalidrawElement[];
  exportWithDarkMode: boolean;
  frame: PresentationFrame;
  index: number;
  isCurrent: boolean;
  isDropTarget: DropIndicator;
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
  onMoveReveal: (
    frame: PresentationFrame,
    elementId: NonDeletedExcalidrawElement["id"],
    direction: -1 | 1,
  ) => void;
  onRemoveReveal: (
    frame: PresentationFrame,
    elementId: NonDeletedExcalidrawElement["id"],
  ) => void;
  onRevealDragEnd: () => void;
  onRevealDragOver: (
    event: React.DragEvent<HTMLDivElement>,
    frameId: PresentationFrame["id"],
    elementId: NonDeletedExcalidrawElement["id"],
  ) => void;
  onRevealDragStart: (
    event: React.DragEvent<HTMLElement>,
    frameId: PresentationFrame["id"],
    elementId: NonDeletedExcalidrawElement["id"],
  ) => void;
  onRevealDrop: (
    event: React.DragEvent<HTMLDivElement>,
    frame: PresentationFrame,
    elementId: NonDeletedExcalidrawElement["id"],
  ) => void;
  onToggleHidden: (frame: PresentationFrame, hidden: boolean) => void;
  presentationActive: boolean;
  revealDropIndicator: RevealDropIndicator;
  signature: string;
  viewBackgroundColor: AppState["viewBackgroundColor"];
}) => {
  const derivedTitle = getPresentationFrameTitle(frame) ?? "";
  const [draftTitle, setDraftTitle] = useState(derivedTitle);
  const revealItems = getPresentationFrameReveals(frame, elements);
  const [isRevealsOpen, setIsRevealsOpen] = useState(revealItems.length > 0);
  const elementById = new Map(elements.map((element) => [element.id, element]));
  const revealElementLabels = new Map(
    revealItems.map((item) => {
      if (!item.element) {
        return [
          item.reveal.elementId,
          item.reason === "moved"
            ? t("presentation.movedObject")
            : t("presentation.missingObject"),
        ] as const;
      }

      const boundTextId = item.element.boundElements?.find(
        (boundElement) => boundElement.type === "text",
      )?.id;
      const boundText =
        boundTextId && elementById.get(boundTextId)?.type === "text"
          ? elementById.get(boundTextId)
          : null;
      const text =
        item.element.type === "text"
          ? item.element.originalText || item.element.text
          : boundText?.type === "text"
          ? boundText.originalText || boundText.text
          : "";
      const fallback = item.element.type.replace(/^\w/, (letter) =>
        letter.toUpperCase(),
      );

      return [
        item.reveal.elementId,
        text.trim() ? text.trim().slice(0, 64) : fallback,
      ] as const;
    }),
  );

  useEffect(() => {
    setDraftTitle(derivedTitle);
  }, [derivedTitle]);

  useEffect(() => {
    if (revealItems.length > 0) {
      setIsRevealsOpen(true);
    }
  }, [revealItems.length]);

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
        exportWithDarkMode={exportWithDarkMode}
        frame={frame}
        signature={signature}
        viewBackgroundColor={viewBackgroundColor}
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
            placeholder={t("presentation.addFrameTitle")}
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
      {revealItems.length > 0 && (
        <div className="PresentationSidebar__reveals" onClick={stopPropagation}>
          <button
            aria-expanded={isRevealsOpen}
            className="PresentationSidebar__revealsToggle"
            data-testid={`presentation-reveals-toggle-${frame.id}`}
            onClick={(event) => {
              event.stopPropagation();
              setIsRevealsOpen((isOpen) => !isOpen);
            }}
            type="button"
          >
            {isRevealsOpen ? collapseUpIcon : collapseDownIcon}
            <span>{t("presentation.reveals")}</span>
            <span className="PresentationSidebar__revealsCount">
              {revealItems.filter((item) => item.isValid).length}
            </span>
          </button>
          {isRevealsOpen && (
            <div className="PresentationSidebar__revealList">
              {revealItems.map((item, revealIndex) => {
                const isRevealDragging =
                  draggedReveal?.frameId === frame.id &&
                  draggedReveal.elementId === item.reveal.elementId;
                const isRevealDropTarget =
                  revealDropIndicator?.frameId === frame.id &&
                  revealDropIndicator.elementId === item.reveal.elementId;

                return (
                  <div
                    className={clsx("PresentationSidebar__revealRow", {
                      "PresentationSidebar__revealRow--invalid": !item.isValid,
                      "PresentationSidebar__revealRow--dragging":
                        isRevealDragging,
                      "PresentationSidebar__revealRow--dropBefore":
                        isRevealDropTarget &&
                        revealDropIndicator?.position === "before",
                      "PresentationSidebar__revealRow--dropAfter":
                        isRevealDropTarget &&
                        revealDropIndicator?.position === "after",
                    })}
                    data-testid={`presentation-reveal-row-${item.reveal.elementId}`}
                    key={`${item.reveal.elementId}:${item.reveal.order}`}
                    onDragOver={(event) =>
                      onRevealDragOver(event, frame.id, item.reveal.elementId)
                    }
                    onDrop={(event) =>
                      onRevealDrop(event, frame, item.reveal.elementId)
                    }
                  >
                    <div className="PresentationSidebar__revealOrder">
                      {revealIndex + 1}
                    </div>
                    <div
                      className="PresentationSidebar__revealLabel"
                      title={revealElementLabels.get(item.reveal.elementId)}
                    >
                      {revealElementLabels.get(item.reveal.elementId)}
                    </div>
                    <div className="PresentationSidebar__revealEffect">
                      {item.reveal.effect === "disappear"
                        ? t("presentation.disappear")
                        : t("presentation.appear")}
                    </div>
                    <div className="PresentationSidebar__revealActions">
                      {canDrag && (
                        <button
                          aria-label={t("presentation.reveals")}
                          className="excalidraw-button PresentationSidebar__iconButton PresentationSidebar__dragHandle"
                          data-testid={`presentation-reveal-drag-${item.reveal.elementId}`}
                          draggable={true}
                          onDragEnd={onRevealDragEnd}
                          onDragStart={(event) =>
                            onRevealDragStart(
                              event,
                              frame.id,
                              item.reveal.elementId,
                            )
                          }
                          title={t("presentation.reveals")}
                          type="button"
                        >
                          {DotsIcon}
                        </button>
                      )}
                      <Button
                        aria-label={t("presentation.moveRevealUp")}
                        className="PresentationSidebar__iconButton"
                        data-testid={`presentation-reveal-move-up-${item.reveal.elementId}`}
                        disabled={revealIndex === 0}
                        onSelect={() =>
                          onMoveReveal(frame, item.reveal.elementId, -1)
                        }
                        title={t("presentation.moveRevealUp")}
                      >
                        {collapseUpIcon}
                      </Button>
                      <Button
                        aria-label={t("presentation.moveRevealDown")}
                        className="PresentationSidebar__iconButton"
                        data-testid={`presentation-reveal-move-down-${item.reveal.elementId}`}
                        disabled={revealIndex === revealItems.length - 1}
                        onSelect={() =>
                          onMoveReveal(frame, item.reveal.elementId, 1)
                        }
                        title={t("presentation.moveRevealDown")}
                      >
                        {collapseDownIcon}
                      </Button>
                      <Button
                        aria-label={t("presentation.removeRevealAction")}
                        className="PresentationSidebar__iconButton"
                        data-testid={`presentation-reveal-remove-${item.reveal.elementId}`}
                        onPointerDown={stopPropagation}
                        onPointerUp={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onRemoveReveal(frame, item.reveal.elementId);
                        }}
                        onSelect={() =>
                          onRemoveReveal(frame, item.reveal.elementId)
                        }
                        title={t("presentation.removeRevealAction")}
                      >
                        {TrashIcon}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
  const [dropIndicator, setDropIndicator] = useState<DropIndicator>(null);
  const [draggedReveal, setDraggedReveal] = useState<DraggedReveal>(null);
  const [revealDropIndicator, setRevealDropIndicator] =
    useState<RevealDropIndicator>(null);
  const [, setSidebarRevision] = useState(0);

  useEffect(() => {
    const unsubscribe = app.scene.onUpdate(() => {
      setSidebarRevision((revision) => revision + 1);
    });

    return () => {
      try {
        unsubscribe();
      } catch {
        // The scene can be destroyed before React effect cleanup in tests.
      }
    };
  }, [app.scene]);

  const orderedFrames = getOrderedPresentationFrames(elements);
  const visibleFrames = getVisiblePresentationFrames(orderedFrames);
  const previewSignatures = getPresentationFramePreviewSignatures(elements);
  const previewAppearanceSignature = `${appState.theme}:${appState.viewBackgroundColor}`;
  const canDrag = editorInterface.formFactor !== "phone";
  const getDraggedFrameId = useCallback(
    (event: Pick<React.DragEvent, "dataTransfer">) =>
      draggedFrameId ||
      (event.dataTransfer.getData("text/plain") as PresentationFrame["id"]) ||
      null,
    [draggedFrameId],
  );
  const getDraggedReveal = useCallback(
    (event: Pick<React.DragEvent, "dataTransfer">) => {
      if (draggedReveal) {
        return draggedReveal;
      }

      const rawPayload = event.dataTransfer.getData(
        PRESENTATION_REVEAL_DRAG_MIME,
      );

      if (!rawPayload) {
        return null;
      }

      try {
        const payload = JSON.parse(rawPayload) as DraggedReveal;
        return payload?.frameId && payload.elementId ? payload : null;
      } catch {
        return null;
      }
    },
    [draggedReveal],
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
      const previousFrame =
        orderedFrames.find(
          (orderedFrame) => orderedFrame.id === currentFrameId,
        ) ?? null;

      app.scrollToContent(frame, {
        animate,
        duration: getPresentationFrameDuration(frame, previousFrame),
        fitToViewport: true,
        viewportZoomFactor: PRESENTATION_VIEWPORT_ZOOM_FACTOR,
      });
    },
    [app, currentFrameId, orderedFrames],
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
      const currentFrame = app.scene.getNonDeletedElementsMap().get(frame.id);

      if (!currentFrame || !isFrameElement(currentFrame)) {
        return;
      }

      app.scene.mutateElement(
        currentFrame,
        {
          customData: buildFramePresentationCustomData(currentFrame, updates),
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

        setPresentationState({
          currentFrameId: frame.id,
          visibleRevealCount: 0,
          revealAnimation: null,
        });
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
      event.dataTransfer.setData("text/plain", frameId);
      setDraggedFrameId(frameId);
      setDropIndicator(null);
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

  const handleRemoveReveal = useCallback(
    (
      frame: PresentationFrame,
      elementId: NonDeletedExcalidrawElement["id"],
    ) => {
      updateFrameMetadata(frame, {
        reveals: removePresentationReveals(frame, [elementId]),
      });
    },
    [updateFrameMetadata],
  );

  const handleMoveReveal = useCallback(
    (
      frame: PresentationFrame,
      elementId: NonDeletedExcalidrawElement["id"],
      direction: -1 | 1,
    ) => {
      updateFrameMetadata(frame, {
        reveals: movePresentationReveal(
          getPresentationReveals(frame),
          elementId,
          direction,
        ),
      });
    },
    [updateFrameMetadata],
  );

  const handleRevealDragStart = useCallback(
    (
      event: React.DragEvent<HTMLElement>,
      frameId: PresentationFrame["id"],
      elementId: NonDeletedExcalidrawElement["id"],
    ) => {
      const payload = { frameId, elementId };

      event.stopPropagation();
      event.dataTransfer.setData(
        PRESENTATION_REVEAL_DRAG_MIME,
        JSON.stringify(payload),
      );
      setDraggedReveal(payload);
      setRevealDropIndicator(null);
    },
    [],
  );

  const handleRevealDragOver = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      frameId: PresentationFrame["id"],
      elementId: NonDeletedExcalidrawElement["id"],
    ) => {
      const activeDraggedReveal = getDraggedReveal(event);

      if (
        !activeDraggedReveal ||
        activeDraggedReveal.frameId !== frameId ||
        activeDraggedReveal.elementId === elementId
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setDraggedReveal(activeDraggedReveal);
      setRevealDropIndicator({
        frameId,
        elementId,
        position: getDropPosition(event),
      });
    },
    [getDraggedReveal],
  );

  const handleRevealDrop = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      frame: PresentationFrame,
      elementId: NonDeletedExcalidrawElement["id"],
    ) => {
      const activeDraggedReveal = getDraggedReveal(event);

      event.preventDefault();
      event.stopPropagation();

      if (
        activeDraggedReveal &&
        activeDraggedReveal.frameId === frame.id &&
        activeDraggedReveal.elementId !== elementId
      ) {
        updateFrameMetadata(frame, {
          reveals: reorderPresentationReveals(
            getFramePresentationData(frame)?.reveals ?? [],
            activeDraggedReveal.elementId,
            elementId,
            getDropPosition(event),
          ),
        });
      }

      setDraggedReveal(null);
      setRevealDropIndicator(null);
    },
    [getDraggedReveal, updateFrameMetadata],
  );

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
                draggedReveal={draggedReveal}
                elements={elements}
                exportWithDarkMode={appState.theme === THEME.DARK}
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
                }}
                onDragOver={handleDragOver}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onJumpToFrame={handleJumpToFrame}
                onMoveReveal={handleMoveReveal}
                onRemoveReveal={handleRemoveReveal}
                onRevealDragEnd={() => {
                  setDraggedReveal(null);
                  setRevealDropIndicator(null);
                }}
                onRevealDragOver={handleRevealDragOver}
                onRevealDragStart={handleRevealDragStart}
                onRevealDrop={handleRevealDrop}
                onToggleHidden={(targetFrame, hidden) =>
                  updateFrameMetadata(targetFrame, { hidden })
                }
                presentationActive={appState.presentationMode.active}
                revealDropIndicator={revealDropIndicator}
                signature={`${
                  previewSignatures.get(frame.id) ?? frame.id
                }:${previewAppearanceSignature}`}
                viewBackgroundColor={appState.viewBackgroundColor}
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
