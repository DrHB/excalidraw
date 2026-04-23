import clsx from "clsx";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { KEYS, isInputLike } from "@excalidraw/common";

import { isFrameElement } from "@excalidraw/element";

import { t } from "../i18n";
import {
  buildFramePresentationCustomData,
  DEFAULT_PRESENTATION_TRANSITION_DURATION,
  getAdjacentPresentationFrame,
  getFramePresentationData,
  getOrderedPresentationFrames,
  getPresentationFrameDuration,
  getPresentationFrameTitle,
  getVisiblePresentationFrames,
  isPresentationFrameHidden,
  PRESENTATION_VIEWPORT_ZOOM_FACTOR,
} from "../presentation/framePresentation";

import { Button } from "./Button";
import { Island } from "./Island";
import {
  chevronLeftIcon,
  chevronRight,
  eyeClosedIcon,
  eyeIcon,
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

const FramePathRow = ({
  frame,
  isCurrent,
  isHidden,
  canMoveUp,
  canMoveDown,
  presentationActive,
  onCommitTitle,
  onJumpToFrame,
  onMove,
  onToggleHidden,
}: {
  frame: PresentationFrame;
  isCurrent: boolean;
  isHidden: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  presentationActive: boolean;
  onCommitTitle: (frame: PresentationFrame, title?: string) => void;
  onJumpToFrame: (frame: PresentationFrame) => void;
  onMove: (frameId: PresentationFrame["id"], direction: -1 | 1) => void;
  onToggleHidden: (frame: PresentationFrame, hidden: boolean) => void;
}) => {
  const derivedTitle = getPresentationFrameTitle(frame) ?? "";
  const [draftTitle, setDraftTitle] = useState(derivedTitle);

  useEffect(() => {
    setDraftTitle(derivedTitle);
  }, [derivedTitle]);

  const commitTitle = useCallback(() => {
    onCommitTitle(frame, draftTitle.trim() || undefined);
  }, [draftTitle, frame, onCommitTitle]);

  return (
    <div
      className={clsx("FramePresentation__pathRow", {
        "FramePresentation__pathRow--current": isCurrent,
        "FramePresentation__pathRow--hidden": isHidden,
      })}
      data-testid={`presentation-frame-row-${frame.id}`}
    >
      <div className="FramePresentation__pathRowMain">
        <div className="FramePresentation__pathRowTitle">
          <input
            className="FramePresentation__pathInput"
            value={draftTitle}
            placeholder={t("presentation.untitledFrame")}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === KEYS.ENTER) {
                event.currentTarget.blur();
              }
            }}
          />
          {isHidden && (
            <span className="FramePresentation__hiddenTag">
              {t("presentation.hiddenTag")}
            </span>
          )}
        </div>
        <div className="FramePresentation__pathActions">
          <Button
            className="FramePresentation__iconButton"
            onSelect={() => onMove(frame.id, -1)}
            disabled={!canMoveUp}
            aria-label={t("presentation.moveUp")}
            title={t("presentation.moveUp")}
            data-testid={`presentation-move-up-${frame.id}`}
          >
            ↑
          </Button>
          <Button
            className="FramePresentation__iconButton"
            onSelect={() => onMove(frame.id, 1)}
            disabled={!canMoveDown}
            aria-label={t("presentation.moveDown")}
            title={t("presentation.moveDown")}
            data-testid={`presentation-move-down-${frame.id}`}
          >
            ↓
          </Button>
          <Button
            className="FramePresentation__iconButton"
            onSelect={() => onToggleHidden(frame, !isHidden)}
            aria-label={
              isHidden ? t("presentation.showFrame") : t("presentation.hideFrame")
            }
            title={
              isHidden ? t("presentation.showFrame") : t("presentation.hideFrame")
            }
            data-testid={`presentation-toggle-hidden-${frame.id}`}
          >
            {isHidden ? eyeClosedIcon : eyeIcon}
          </Button>
          <Button
            className="FramePresentation__iconButton"
            onSelect={() => onJumpToFrame(frame)}
            disabled={presentationActive && isHidden}
            aria-label={t("presentation.jumpToFrame")}
            title={t("presentation.jumpToFrame")}
            data-testid={`presentation-jump-${frame.id}`}
          >
            {chevronRight}
          </Button>
        </div>
      </div>
    </div>
  );
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
        if (getFramePresentationData(frame)?.order === index) {
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

  const handleMoveFrame = useCallback(
    (frameId: PresentationFrame["id"], direction: -1 | 1) => {
      const currentIndex = orderedFrames.findIndex((frame) => frame.id === frameId);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= orderedFrames.length
      ) {
        return;
      }

      const nextFrames = [...orderedFrames];
      [nextFrames[currentIndex], nextFrames[nextIndex]] = [
        nextFrames[nextIndex],
        nextFrames[currentIndex],
      ];
      applyFrameOrder(nextFrames);
    },
    [applyFrameOrder, orderedFrames],
  );

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

      const nextFrame = initialFrame ?? selectedFrame ?? visibleFrames[0] ?? null;

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

  const handleJumpToFrame = useCallback(
    (frame: PresentationFrame) => {
      if (appState.presentationMode.active) {
        if (isPresentationFrameHidden(frame)) {
          return;
        }
        handleNavigateToFrame(frame);
        return;
      }

      scrollToFrame(frame);
      focusEditor();
    },
    [
      appState.presentationMode.active,
      focusEditor,
      handleNavigateToFrame,
      scrollToFrame,
    ],
  );

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

  const shouldShowPathPanel =
    mode !== "controls" &&
    appState.presentationMode.pathPanelOpen &&
    (!isMobile || appState.presentationMode.active);

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
            className="FramePresentation__toolButton"
            type="button"
            icon={frameToolIcon}
            onClick={() => {
              app.setActiveTool({ type: "frame" });
              focusEditor();
            }}
            selected={appState.activeTool.type === "frame"}
            data-testid="toolbar-draw-frames"
            title={`${t("presentation.drawFrames")} - ${KEYS.F.toUpperCase()}`}
            aria-label={t("presentation.drawFrames")}
          />
          <ToolButton
            className="FramePresentation__toolButton"
            type="button"
            icon={presentationIcon}
            onClick={() => handleStartPresentation()}
            disabled={!visibleFrames.length}
            data-testid="toolbar-present"
            title={t("presentation.present")}
            aria-label={t("presentation.present")}
          />
          <ToolButton
            className="FramePresentation__toolButton"
            type="button"
            icon={historyIcon}
            onClick={() =>
              setPresentationState((state) => ({
                pathPanelOpen: !state.pathPanelOpen,
              }))
            }
            selected={appState.presentationMode.pathPanelOpen}
            data-testid="toolbar-frame-path"
            title={t("presentation.framePath")}
            aria-label={t("presentation.framePath")}
          />
        </Island>
      )}

      {shouldShowPathPanel && (
        <div
          className="FramePresentation__pathPanel"
          data-testid="presentation-frame-path-panel"
        >
          <Island padding={2} className="FramePresentation__pathPanelIsland">
            <div className="FramePresentation__panelHeader">
              <div>
                <div className="FramePresentation__panelTitle">
                  {t("presentation.framePath")}
                </div>
                <div className="FramePresentation__panelDescription">
                  {!orderedFrames.length
                    ? t("presentation.noFrames")
                    : !visibleFrames.length
                    ? t("presentation.allFramesHidden")
                    : t("presentation.pathHint")}
                </div>
              </div>
              <Button
                className="FramePresentation__iconButton"
                onSelect={() => setPresentationState({ pathPanelOpen: false })}
                aria-label={t("buttons.close")}
                title={t("buttons.close")}
              >
                ×
              </Button>
            </div>

            {orderedFrames.length > 0 && (
              <div className="FramePresentation__pathList">
                {orderedFrames.map((frame, index) => (
                  <FramePathRow
                    key={frame.id}
                    frame={frame}
                    isCurrent={frame.id === currentFrameId}
                    isHidden={isPresentationFrameHidden(frame)}
                    canMoveUp={index > 0}
                    canMoveDown={index < orderedFrames.length - 1}
                    presentationActive={appState.presentationMode.active}
                    onMove={handleMoveFrame}
                    onJumpToFrame={handleJumpToFrame}
                    onToggleHidden={(targetFrame, hidden) =>
                      updateFrameMetadata(targetFrame, { hidden })
                    }
                    onCommitTitle={(targetFrame, title) =>
                      updateFrameMetadata(targetFrame, { title })
                    }
                  />
                ))}
              </div>
            )}
          </Island>
        </div>
      )}

      {mode !== "controls" &&
        appState.presentationMode.active &&
        currentVisibleFrame && (
        <div className="FramePresentation__overlay" data-testid="presentation-overlay">
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
                className="FramePresentation__toolButton"
                type="button"
                icon={chevronLeftIcon}
                showAriaLabel={true}
                onClick={() => handleNavigateToFrame(previousFrame)}
                disabled={!previousFrame}
                data-testid="presentation-previous"
                title={t("presentation.previous")}
                aria-label={t("presentation.previous")}
              />
              <ToolButton
                className="FramePresentation__toolButton"
                type="button"
                icon={historyIcon}
                showAriaLabel={true}
                onClick={() =>
                  setPresentationState((state) => ({
                    pathPanelOpen: !state.pathPanelOpen,
                  }))
                }
                selected={appState.presentationMode.pathPanelOpen}
                data-testid="presentation-frame-path-toggle"
                title={t("presentation.framePath")}
                aria-label={t("presentation.framePath")}
              />
              <ToolButton
                className="FramePresentation__toolButton"
                type="button"
                icon={chevronRight}
                showAriaLabel={true}
                onClick={() => handleNavigateToFrame(nextFrame)}
                disabled={!nextFrame}
                data-testid="presentation-next"
                title={t("presentation.next")}
                aria-label={t("presentation.next")}
              />
              <ToolButton
                className="FramePresentation__toolButton"
                type="button"
                icon={playerStopFilledIcon}
                showAriaLabel={true}
                onClick={handleExitPresentation}
                data-testid="presentation-exit"
                title={t("presentation.exit")}
                aria-label={t("presentation.exit")}
              />
            </div>
          </Island>
        </div>
      )}
    </>
  );
};
