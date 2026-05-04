import React, {
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
  isInputLike,
} from "@excalidraw/common";
import { isFrameElement } from "@excalidraw/element";

import type {
  ExcalidrawFrameElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { t } from "../i18n";
import {
  buildFramePresentationCustomData,
  DEFAULT_PRESENTATION_REVEAL_DURATION,
  DEFAULT_PRESENTATION_TRANSITION_DURATION,
  getAdjacentPresentationFrame,
  getOrderedPresentationFrames,
  getPresentationFrameDuration,
  getPresentationFrameTitle,
  getPresentationRevealEffectForElements,
  getPresentationRevealSteps,
  getVisiblePresentationFrames,
  isPresentationFrameHidden,
  PRESENTATION_VIEWPORT_ZOOM_FACTOR,
  type PresentationRevealEffect,
  updatePresentationFrameReveals,
} from "../presentation/framePresentation";

import { Island } from "./Island";
import {
  chevronLeftIcon,
  chevronRight,
  frameToolIcon,
  historyIcon,
  MagicIcon,
  playerStopFilledIcon,
  presentationIcon,
} from "./icons";
import { ToolButton } from "./ToolButton";

import "./FramePresentation.scss";

import type { AppClassProperties, AppState, UIAppState } from "../types";

type PresentationFrame = NonDeleted<ExcalidrawFrameElement>;

const PRESENTATION_EFFECT_OPTIONS: readonly {
  effect: PresentationRevealEffect;
  testId: string;
}[] = [
  { effect: "none", testId: "presentation-effect-none" },
  { effect: "appear", testId: "presentation-effect-appear" },
  { effect: "disappear", testId: "presentation-effect-disappear" },
  { effect: "fadeIn", testId: "presentation-effect-fade-in" },
  { effect: "fadeOut", testId: "presentation-effect-fade-out" },
];

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
  const currentRevealSteps = useMemo(
    () =>
      currentVisibleFrame
        ? getPresentationRevealSteps(currentVisibleFrame)
        : [],
    [currentVisibleFrame],
  );
  const currentRevealStep = appState.presentationMode.currentRevealStep;
  const hasNextRevealStep = currentRevealStep < currentRevealSteps.length - 1;
  const hasPreviousRevealStep = currentRevealStep >= 0;

  const previousFrameCountRef = useRef(orderedFrames.length);
  const hasAutoOpenedSidebarRef = useRef(false);
  const firstOrderedFrame = orderedFrames[0] ?? null;

  const isPresentationSidebarOpen =
    appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
    appState.openSidebar.tab === PRESENTATION_SIDEBAR_TAB;

  const [isEffectMenuOpen, setIsEffectMenuOpen] = useState(false);
  const effectControlRef = useRef<HTMLDivElement>(null);
  const effectTarget = useMemo(() => {
    const selectedElements = elements.filter(
      (element) => appState.selectedElementIds[element.id],
    );

    if (
      !selectedElements.length ||
      selectedElements.some((element) => isFrameElement(element))
    ) {
      return null;
    }

    const frameId = selectedElements[0].frameId;

    if (
      !frameId ||
      selectedElements.some((element) => element.frameId !== frameId)
    ) {
      return null;
    }

    const frame = orderedFrames.find((frame) => frame.id === frameId) ?? null;

    return frame ? { frame, elements: selectedElements } : null;
  }, [appState.selectedElementIds, elements, orderedFrames]);
  const effectTargetElementIds = useMemo(
    () => effectTarget?.elements.map((element) => element.id) ?? [],
    [effectTarget],
  );
  const selectedRevealEffect = effectTarget
    ? getPresentationRevealEffectForElements(
        effectTarget.frame,
        effectTargetElementIds,
      )
    : "none";

  useEffect(() => {
    if (!effectTarget) {
      setIsEffectMenuOpen(false);
    }
  }, [effectTarget]);

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

  useEffect(() => {
    if (!isEffectMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!effectControlRef.current?.contains(event.target as Node)) {
        setIsEffectMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isEffectMenuOpen]);

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

  const handleApplyEffect = useCallback(
    (effect: PresentationRevealEffect) => {
      if (!effectTarget) {
        setIsEffectMenuOpen(false);
        return;
      }

      app.scene.mutateElement(
        effectTarget.frame,
        {
          customData: buildFramePresentationCustomData(effectTarget.frame, {
            reveals: updatePresentationFrameReveals(
              effectTarget.frame,
              effectTargetElementIds,
              effect,
            ),
          }),
        },
        { informMutation: true, isDragging: false },
      );
      setIsEffectMenuOpen(false);
      focusEditor();
    },
    [app.scene, effectTarget, effectTargetElementIds, focusEditor],
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
          currentRevealStep: -1,
          revealAnimation: null,
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
        currentRevealStep: -1,
        revealAnimation: null,
        sourceViewModeEnabled: false,
      },
    }));
    focusEditor();
  }, [focusEditor, setAppState]);

  const handleNavigateToFrame = useCallback(
    (frame: PresentationFrame | null, revealStep = -1) => {
      if (!frame) {
        return;
      }

      setPresentationState({
        currentFrameId: frame.id,
        currentRevealStep: revealStep,
        revealAnimation: null,
      });
      scrollToFrame(frame);
      focusEditor();
    },
    [focusEditor, scrollToFrame, setPresentationState],
  );

  const startRevealStep = useCallback(
    (order: number, direction: -1 | 1) => {
      const revealStep = currentRevealSteps[order];

      if (!currentVisibleFrame || !revealStep) {
        return;
      }

      const nextRevealStep = direction > 0 ? order : order - 1;
      const hasFadeReveal = revealStep.reveals.some(
        (reveal) => reveal.effect === "fadeIn" || reveal.effect === "fadeOut",
      );

      setPresentationState({
        currentRevealStep: nextRevealStep,
        revealAnimation: hasFadeReveal
          ? {
              frameId: currentVisibleFrame.id,
              order,
              direction,
              durationMs: Math.max(
                1,
                ...revealStep.reveals.map(
                  (reveal) =>
                    reveal.durationMs ?? DEFAULT_PRESENTATION_REVEAL_DURATION,
                ),
              ),
              progress: 0,
            }
          : null,
      });
      focusEditor();
    },
    [
      currentRevealSteps,
      currentVisibleFrame,
      focusEditor,
      setPresentationState,
    ],
  );

  const handleNextPresentationStep = useCallback(() => {
    if (appState.presentationMode.revealAnimation) {
      return;
    }

    if (hasNextRevealStep) {
      startRevealStep(currentRevealStep + 1, 1);
      return;
    }

    handleNavigateToFrame(nextFrame, -1);
  }, [
    appState.presentationMode.revealAnimation,
    currentRevealStep,
    handleNavigateToFrame,
    hasNextRevealStep,
    nextFrame,
    startRevealStep,
  ]);

  const handlePreviousPresentationStep = useCallback(() => {
    if (appState.presentationMode.revealAnimation) {
      return;
    }

    if (hasPreviousRevealStep) {
      startRevealStep(currentRevealStep, -1);
      return;
    }

    handleNavigateToFrame(
      previousFrame,
      previousFrame ? getPresentationRevealSteps(previousFrame).length - 1 : -1,
    );
  }, [
    appState.presentationMode.revealAnimation,
    currentRevealStep,
    handleNavigateToFrame,
    hasPreviousRevealStep,
    previousFrame,
    startRevealStep,
  ]);

  const revealAnimation = appState.presentationMode.revealAnimation;

  useEffect(() => {
    if (!appState.presentationMode.active || !revealAnimation) {
      return;
    }

    let frameId = 0;
    const startedAt =
      performance.now() - revealAnimation.progress * revealAnimation.durationMs;

    const tick = () => {
      const progress = Math.min(
        (performance.now() - startedAt) / revealAnimation.durationMs,
        1,
      );

      setPresentationState((presentationMode) => {
        const currentAnimation = presentationMode.revealAnimation;

        if (
          !currentAnimation ||
          currentAnimation.frameId !== revealAnimation.frameId ||
          currentAnimation.order !== revealAnimation.order ||
          currentAnimation.direction !== revealAnimation.direction
        ) {
          return {};
        }

        return {
          revealAnimation:
            progress >= 1
              ? null
              : {
                  ...currentAnimation,
                  progress,
                },
        };
      });

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [appState.presentationMode.active, revealAnimation, setPresentationState]);

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
        currentRevealStep: -1,
        revealAnimation: null,
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

    setPresentationState({
      currentFrameId: fallbackFrame.id,
      currentRevealStep: -1,
      revealAnimation: null,
    });
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
        if (hasNextRevealStep || nextFrame) {
          event.preventDefault();
          handleNextPresentationStep();
        }
        return;
      }

      if (
        event.key === KEYS.ARROW_LEFT ||
        event.key === KEYS.ARROW_UP ||
        event.key === KEYS.PAGE_UP ||
        event.key === KEYS.BACKSPACE
      ) {
        if (hasPreviousRevealStep || previousFrame) {
          event.preventDefault();
          handlePreviousPresentationStep();
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
    handleNextPresentationStep,
    handlePreviousPresentationStep,
    hasNextRevealStep,
    hasPreviousRevealStep,
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
          <div
            className="FramePresentation__effectControl"
            ref={effectControlRef}
          >
            <ToolButton
              aria-label={t("presentation.effect")}
              className="FramePresentation__toolButton"
              data-testid="toolbar-effects"
              disabled={!effectTarget}
              icon={MagicIcon}
              onClick={() => {
                if (effectTarget) {
                  setIsEffectMenuOpen((open) => !open);
                }
              }}
              selected={
                isEffectMenuOpen ||
                (!!selectedRevealEffect && selectedRevealEffect !== "none")
              }
              title={t("presentation.effect")}
              type="button"
            />
            {isEffectMenuOpen && effectTarget && (
              <div
                className="FramePresentation__effectMenu"
                data-testid="presentation-effect-menu"
              >
                {PRESENTATION_EFFECT_OPTIONS.map((option) => (
                  <button
                    aria-pressed={selectedRevealEffect === option.effect}
                    className="FramePresentation__effectMenuItem"
                    data-testid={option.testId}
                    key={option.effect}
                    onClick={() => handleApplyEffect(option.effect)}
                    type="button"
                  >
                    {getPresentationEffectLabel(option.effect)}
                  </button>
                ))}
              </div>
            )}
          </div>
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
                  disabled={!hasPreviousRevealStep && !previousFrame}
                  icon={chevronLeftIcon}
                  onClick={handlePreviousPresentationStep}
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
                  disabled={!hasNextRevealStep && !nextFrame}
                  icon={chevronRight}
                  onClick={handleNextPresentationStep}
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
