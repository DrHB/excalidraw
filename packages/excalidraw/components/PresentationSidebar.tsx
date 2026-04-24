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
  THEME,
} from "@excalidraw/common";
import { selectGroupsForSelectedElements } from "@excalidraw/element";

import { t } from "../i18n";
import { usePresentationFrameSvg } from "../hooks/usePresentationFrameSvg";
import {
  buildFramePresentationCustomData,
  getPresentationFramePreviewSignatures,
  getOrderedPresentationFrames,
  getPresentationFrameDuration,
  getPresentationFrameTitle,
  getVisiblePresentationFrames,
  isPresentationFrameHidden,
  PRESENTATION_VIEWPORT_ZOOM_FACTOR,
  reorderPresentationFrames,
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
import { DotsIcon, eyeClosedIcon, eyeIcon, chevronRight } from "./icons";

import "./PresentationSidebar.scss";

import type {
  ExcalidrawFrameElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { AppState } from "../types";

type PresentationFrame = NonDeleted<ExcalidrawFrameElement>;
type DropPosition = "before" | "after";
type DropIndicator = {
  frameId: PresentationFrame["id"];
  position: DropPosition;
} | null;

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
  onToggleHidden,
  presentationActive,
  signature,
  viewBackgroundColor,
}: {
  canDrag: boolean;
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
  onToggleHidden: (frame: PresentationFrame, hidden: boolean) => void;
  presentationActive: boolean;
  signature: string;
  viewBackgroundColor: AppState["viewBackgroundColor"];
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
  const previewAppearanceSignature = `${appState.theme}:${appState.viewBackgroundColor}`;
  const canDrag = editorInterface.formFactor !== "phone";
  const getDraggedFrameId = useCallback(
    (event: Pick<React.DragEvent, "dataTransfer">) =>
      draggedFrameId ||
      (event.dataTransfer.getData("text/plain") as PresentationFrame["id"]) ||
      null,
    [draggedFrameId],
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
                onToggleHidden={(targetFrame, hidden) =>
                  updateFrameMetadata(targetFrame, { hidden })
                }
                presentationActive={appState.presentationMode.active}
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
