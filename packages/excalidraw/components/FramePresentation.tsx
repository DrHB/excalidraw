import React, { useCallback, useEffect, useMemo, useRef } from "react";

import {
  DEFAULT_SIDEBAR,
  KEYS,
  PRESENTATION_SIDEBAR_TAB,
  isInputLike,
} from "@excalidraw/common";
import { isFrameElement } from "@excalidraw/element";

import { t } from "../i18n";
import {
  DEFAULT_PRESENTATION_TRANSITION_DURATION,
  getAdjacentPresentationFrame,
  getOrderedPresentationFrames,
  getPresentationFrameDuration,
  getPresentationFrameTitle,
  getVisiblePresentationFrames,
  isPresentationFrameHidden,
  PRESENTATION_VIEWPORT_ZOOM_FACTOR,
} from "../presentation/framePresentation";

import { Island } from "./Island";
import {
  chevronLeftIcon,
  chevronRight,
  frameToolIcon,
  historyIcon,
  playerStopFilledIcon,
  presentationIcon,
} from "./icons";
import { ToolButton } from "./ToolButton";

import "./FramePresentation.scss";

import type {
  ExcalidrawFrameElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { AppClassProperties, AppState, UIAppState } from "../types";

type PresentationFrame = NonDeleted<ExcalidrawFrameElement>;

type FramePresentationProps = {
  app: AppClassProperties;
  appState: UIAppState;
  elements: readonly NonDeletedExcalidrawElement[];
  isMobile: boolean;
  mode?: "all" | "controls" | "layer";
  setAppState: React.Component<any, AppState>["setState"];
};

export const FramePresentation = ({
  app,
  appState,
  elements,
  isMobile,
  mode = "all",
  setAppState,
}: FramePresentationProps) => {
  const orderedFrames = useMemo(
    () => getOrderedPresentationFrames(elements),
    [elements],
  );
  const visibleFrames = useMemo(
    () => getVisiblePresentationFrames(orderedFrames),
    [orderedFrames],
  );

  const currentFrameId = appState.presentationMode.currentFrameId;
  const currentVisibleFrame = useMemo(
    () => visibleFrames.find((frame) => frame.id === currentFrameId) ?? null,
    [visibleFrames, currentFrameId],
  );
  const currentVisibleFrameIndex = currentVisibleFrame
    ? visibleFrames.findIndex((frame) => frame.id === currentVisibleFrame.id)
    : -1;

  const previousFrame = useMemo(
    () => getAdjacentPresentationFrame(orderedFrames, currentFrameId, -1),
    [orderedFrames, currentFrameId],
  );
  const nextFrame = useMemo(
    () => getAdjacentPresentationFrame(orderedFrames, currentFrameId, 1),
    [orderedFrames, currentFrameId],
  );

  const previousFrameCountRef = useRef(orderedFrames.length);
  const hasAutoOpenedSidebarRef = useRef(false);
  const firstOrderedFrame = orderedFrames[0] ?? null;

  const isPresentationSidebarOpen =
    appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
    appState.openSidebar.tab === PRESENTATION_SIDEBAR_TAB;

  const scrollToFrame = useCallback(
    (frame: PresentationFrame, animate = true) => {
      app.scrollToContent(frame, {
        fitToViewport: true,
        viewportZoomFactor: PRESENTATION_VIEWPORT_ZOOM_FACTOR,
        animate,
        duration:
          getPresentationFrameDuration(frame) ??
          DEFAULT_PRESENTATION_TRANSITION_DURATION,
      });
    },
    [app],
  );

  const focusEditor = useCallback(() => {
    window.setTimeout(() => {
      app.focusContainer();
    }, 0);
  }, [app]);

  const setPresentationState = useCallback(
    (
      updater:
        | Partial<AppState["presentationMode"]>
        | ((
            state: AppState["presentationMode"],
          ) => Partial<AppState["presentationMode"]>),
    ) => {
      setAppState((state) => {
        const nextState =
          typeof updater === "function"
            ? updater(state.presentationMode)
            : updater;

        return {
          presentationMode: {
            ...state.presentationMode,
            ...nextState,
          },
        };
      });
    },
    [setAppState],
  );

  const togglePresentationSidebar = useCallback(() => {
    setAppState((state) => ({
      openSidebar:
        state.openSidebar?.name === DEFAULT_SIDEBAR.name &&
        state.openSidebar.tab === PRESENTATION_SIDEBAR_TAB
          ? null
          : {
              name: DEFAULT_SIDEBAR.name,
              tab: PRESENTATION_SIDEBAR_TAB,
            },
    }));
  }, [setAppState]);

  const handleStartPresentation = useCallback(
    (initialFrame?: PresentationFrame | null) => {
      const selectedFrame = app.scene
        .getSelectedElements({
          selectedElementIds: appState.selectedElementIds,
        })
        .find(
          (element): element is PresentationFrame =>
            isFrameElement(element) && !isPresentationFrameHidden(element),
        );

      const nextFrame =
        initialFrame ?? selectedFrame ?? visibleFrames[0] ?? null;

      if (!nextFrame) {
        return;
      }

      setAppState((state) => ({
        viewModeEnabled: true,
        presentationMode: {
          ...state.presentationMode,
          active: true,
          currentFrameId: nextFrame.id,
          sourceViewModeEnabled: state.viewModeEnabled,
        },
      }));
      scrollToFrame(nextFrame);
      focusEditor();
    },
    [
      app.scene,
      appState.selectedElementIds,
      focusEditor,
      scrollToFrame,
      setAppState,
      visibleFrames,
    ],
  );

  const handleExitPresentation = useCallback(() => {
    setAppState((state) => ({
      viewModeEnabled: state.presentationMode.sourceViewModeEnabled,
      presentationMode: {
        ...state.presentationMode,
        active: false,
        currentFrameId: null,
        sourceViewModeEnabled: false,
      },
    }));
    focusEditor();
  }, [focusEditor, setAppState]);

  const handleNavigateToFrame = useCallback(
    (frame: PresentationFrame | null) => {
      if (!frame) {
        return;
      }

      setPresentationState({ currentFrameId: frame.id });
      scrollToFrame(frame);
      focusEditor();
    },
    [focusEditor, scrollToFrame, setPresentationState],
  );

  useEffect(() => {
    if (mode === "controls" || isMobile) {
      return;
    }

    const previousFrameCount = previousFrameCountRef.current;

    if (
      !hasAutoOpenedSidebarRef.current &&
      previousFrameCount === 0 &&
      orderedFrames.length === 1 &&
      firstOrderedFrame &&
      (appState.activeTool.type === "frame" ||
        appState.selectedElementIds[firstOrderedFrame.id])
    ) {
      hasAutoOpenedSidebarRef.current = true;
      setAppState({
        openSidebar: {
          name: DEFAULT_SIDEBAR.name,
          tab: PRESENTATION_SIDEBAR_TAB,
        },
      });
    }

    previousFrameCountRef.current = orderedFrames.length;
  }, [
    appState.activeTool.type,
    appState.selectedElementIds,
    firstOrderedFrame,
    isMobile,
    mode,
    orderedFrames.length,
    setAppState,
  ]);

  useEffect(() => {
    if (!appState.presentationMode.active) {
      return;
    }

    if (!appState.viewModeEnabled) {
      setPresentationState({
        active: false,
        currentFrameId: null,
        sourceViewModeEnabled: false,
      });
      return;
    }

    if (!visibleFrames.length) {
      handleExitPresentation();
      return;
    }

    if (currentVisibleFrame) {
      return;
    }

    const fallbackFrame =
      getAdjacentPresentationFrame(orderedFrames, currentFrameId, 1) ??
      getAdjacentPresentationFrame(orderedFrames, currentFrameId, -1) ??
      visibleFrames[0] ??
      null;

    if (!fallbackFrame) {
      handleExitPresentation();
      return;
    }

    setPresentationState({ currentFrameId: fallbackFrame.id });
    scrollToFrame(fallbackFrame);
  }, [
    appState.presentationMode.active,
    appState.viewModeEnabled,
    currentFrameId,
    currentVisibleFrame,
    handleExitPresentation,
    orderedFrames,
    scrollToFrame,
    setPresentationState,
    visibleFrames,
  ]);

  useEffect(() => {
    if (!appState.presentationMode.active) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isInputLike(event.target)) {
        return;
      }

      if (event.key === KEYS.ESCAPE) {
        event.preventDefault();
        handleExitPresentation();
        return;
      }

      if (
        event.key === KEYS.ARROW_RIGHT ||
        event.key === KEYS.ARROW_DOWN ||
        event.key === KEYS.PAGE_DOWN ||
        event.key === KEYS.SPACE ||
        event.key === KEYS.ENTER
      ) {
        if (nextFrame) {
          event.preventDefault();
          handleNavigateToFrame(nextFrame);
        }
        return;
      }

      if (
        event.key === KEYS.ARROW_LEFT ||
        event.key === KEYS.ARROW_UP ||
        event.key === KEYS.PAGE_UP ||
        event.key === KEYS.BACKSPACE
      ) {
        if (previousFrame) {
          event.preventDefault();
          handleNavigateToFrame(previousFrame);
        }
        return;
      }

      if (event.key === "Home") {
        const firstFrame = visibleFrames[0] ?? null;
        if (firstFrame) {
          event.preventDefault();
          handleNavigateToFrame(firstFrame);
        }
        return;
      }

      if (event.key === "End") {
        const lastFrame =
          visibleFrames.length > 0
            ? visibleFrames[visibleFrames.length - 1]
            : null;
        if (lastFrame) {
          event.preventDefault();
          handleNavigateToFrame(lastFrame);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    appState.presentationMode.active,
    handleExitPresentation,
    handleNavigateToFrame,
    nextFrame,
    previousFrame,
    visibleFrames,
  ]);

  const shouldShowControls =
    mode !== "layer" &&
    !isMobile &&
    !appState.presentationMode.active &&
    !appState.viewModeEnabled;

  return (
    <>
      {shouldShowControls && (
        <Island padding={1} className="FramePresentation__toolbar">
          <ToolButton
            aria-label={t("presentation.drawFrames")}
            className="FramePresentation__toolButton"
            data-testid="toolbar-draw-frames"
            icon={frameToolIcon}
            onClick={() => {
              app.setActiveTool({ type: "frame" });
              focusEditor();
            }}
            selected={appState.activeTool.type === "frame"}
            title={`${t("presentation.drawFrames")} - ${KEYS.F.toUpperCase()}`}
            type="button"
          />
          <ToolButton
            aria-label={t("presentation.present")}
            className="FramePresentation__toolButton"
            data-testid="toolbar-present"
            disabled={!visibleFrames.length}
            icon={presentationIcon}
            onClick={() => handleStartPresentation()}
            title={t("presentation.present")}
            type="button"
          />
          <ToolButton
            aria-label={t("presentation.framePath")}
            className="FramePresentation__toolButton"
            data-testid="toolbar-frame-path"
            icon={historyIcon}
            onClick={togglePresentationSidebar}
            selected={isPresentationSidebarOpen}
            title={t("presentation.framePath")}
            type="button"
          />
        </Island>
      )}

      {mode !== "controls" &&
        appState.presentationMode.active &&
        currentVisibleFrame && (
          <div
            className="FramePresentation__overlay"
            data-testid="presentation-overlay"
          >
            <Island padding={2} className="FramePresentation__overlayIsland">
              <div className="FramePresentation__overlayMeta">
                <div className="FramePresentation__overlayTitle">
                  {getPresentationFrameTitle(currentVisibleFrame) ??
                    t("presentation.untitledFrame")}
                </div>
                <div className="FramePresentation__overlayCount">
                  {currentVisibleFrameIndex + 1} / {visibleFrames.length}
                </div>
              </div>
              <div className="FramePresentation__overlayActions">
                <ToolButton
                  aria-label={t("presentation.previous")}
                  className="FramePresentation__toolButton"
                  data-testid="presentation-previous"
                  disabled={!previousFrame}
                  icon={chevronLeftIcon}
                  onClick={() => handleNavigateToFrame(previousFrame)}
                  showAriaLabel={true}
                  title={t("presentation.previous")}
                  type="button"
                />
                <ToolButton
                  aria-label={t("presentation.framePath")}
                  className="FramePresentation__toolButton"
                  data-testid="presentation-frame-path-toggle"
                  icon={historyIcon}
                  onClick={togglePresentationSidebar}
                  selected={isPresentationSidebarOpen}
                  showAriaLabel={true}
                  title={t("presentation.framePath")}
                  type="button"
                />
                <ToolButton
                  aria-label={t("presentation.next")}
                  className="FramePresentation__toolButton"
                  data-testid="presentation-next"
                  disabled={!nextFrame}
                  icon={chevronRight}
                  onClick={() => handleNavigateToFrame(nextFrame)}
                  showAriaLabel={true}
                  title={t("presentation.next")}
                  type="button"
                />
                <ToolButton
                  aria-label={t("presentation.exit")}
                  className="FramePresentation__toolButton"
                  data-testid="presentation-exit"
                  icon={playerStopFilledIcon}
                  onClick={handleExitPresentation}
                  showAriaLabel={true}
                  title={t("presentation.exit")}
                  type="button"
                />
              </div>
            </Island>
          </div>
        )}
    </>
  );
};
