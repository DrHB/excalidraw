import clsx from "clsx";
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
  NonDeletedSceneElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { t } from "../i18n";
import {
  buildFramePresentationCustomData,
  getAdjacentPresentationFrame,
  getOrderedPresentationFrames,
  getPresentationFrameDuration,
  getPresentationFrameReveals,
  getPresentationFrameTitle,
  getPresentationRevealRenderElementIds,
  getPresentationRevealSelection,
  getPresentationReveals,
  getVisiblePresentationFrames,
  isPresentationFrameHidden,
  PRESENTATION_REVEAL_DURATION,
  PRESENTATION_VIEWPORT_ZOOM_FACTOR,
  removePresentationReveals,
  setPresentationRevealEffects,
} from "../presentation/framePresentation";

import { Island } from "./Island";
import DropdownMenu from "./dropdownMenu/DropdownMenu";
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
import type { StoryplanePresentationRevealEffect } from "../presentation/framePresentation";

type PresentationFrame = NonDeleted<ExcalidrawFrameElement>;

const isAnimatedRevealEffect = (effect: StoryplanePresentationRevealEffect) =>
  effect === "fade" || effect === "fadeIn" || effect === "fadeOut";

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
  const selectedElementIds = appState.selectedElementIds;
  const currentVisibleFrame = useMemo(
    () => visibleFrames.find((frame) => frame.id === currentFrameId) ?? null,
    [visibleFrames, currentFrameId],
  );
  const currentVisibleFrameIndex = currentVisibleFrame
    ? visibleFrames.findIndex((frame) => frame.id === currentVisibleFrame.id)
    : -1;
  const currentFrameReveals = useMemo(
    () =>
      currentVisibleFrame
        ? getPresentationFrameReveals(currentVisibleFrame, elements)
        : [],
    [currentVisibleFrame, elements],
  );
  const visibleRevealCount = Math.max(
    0,
    Math.min(
      appState.presentationMode.visibleRevealCount,
      currentFrameReveals.length,
    ),
  );

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
  const revealAnimationFrameRef = useRef<number | null>(null);
  const [isEffectMenuOpen, setIsEffectMenuOpen] = useState(false);
  const [, setRevealMetadataVersion] = useState(0);
  const firstOrderedFrame = orderedFrames[0] ?? null;

  const isPresentationSidebarOpen =
    appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
    appState.openSidebar.tab === PRESENTATION_SIDEBAR_TAB;

  const revealSelection = useMemo(() => {
    const elementsMap = app.scene.getNonDeletedElementsMap();
    const selectedElements = elements.filter(
      (element) => selectedElementIds[element.id],
    );

    return getPresentationRevealSelection(selectedElements, elementsMap);
  }, [app.scene, elements, selectedElementIds]);

  const selectedRevealState = (() => {
    if (!revealSelection) {
      return {
        effect: null,
        hasReveal: false,
      };
    }

    const currentFrame = app.scene
      .getNonDeletedElementsMap()
      .get(revealSelection.frame.id);

    if (!currentFrame || !isFrameElement(currentFrame)) {
      return {
        effect: null,
        hasReveal: false,
      };
    }

    const selectedElementIds = new Set(revealSelection.elementIds);
    const selectedReveals = getPresentationReveals(currentFrame).filter(
      (reveal) => selectedElementIds.has(reveal.elementId),
    );
    const selectedEffects = new Set(
      selectedReveals.map((reveal) => reveal.effect),
    );

    return {
      effect:
        selectedReveals.length === revealSelection.elementIds.length &&
        selectedEffects.size === 1
          ? selectedReveals[0]?.effect ?? null
          : null,
      hasReveal: selectedReveals.length > 0,
    };
  })();

  const scrollToFrame = useCallback(
    (frame: PresentationFrame, animate = true) => {
      const previousFrame = appState.presentationMode.active
        ? visibleFrames.find(
            (visibleFrame) => visibleFrame.id === currentFrameId,
          ) ?? null
        : null;

      app.scrollToContent(frame, {
        fitToViewport: true,
        viewportZoomFactor: PRESENTATION_VIEWPORT_ZOOM_FACTOR,
        animate,
        duration: getPresentationFrameDuration(frame, previousFrame),
      });
    },
    [app, appState.presentationMode.active, currentFrameId, visibleFrames],
  );

  const focusEditor = useCallback(() => {
    window.setTimeout(() => {
      app.focusContainer();
    }, 0);
  }, [app]);

  useEffect(() => {
    if (!revealSelection) {
      setIsEffectMenuOpen(false);
    }
  }, [revealSelection]);

  const handleEffectMenuToggle = useCallback(() => {
    if (!revealSelection) {
      return;
    }

    setIsEffectMenuOpen((isOpen) => !isOpen);
    setAppState({ openMenu: null, openPopup: null });
  }, [revealSelection, setAppState]);

  const updateRevealMetadata = useCallback(
    (
      updater: (
        frame: PresentationFrame,
        elementsMap: NonDeletedSceneElementsMap,
      ) => Parameters<typeof buildFramePresentationCustomData>[1]["reveals"],
    ) => {
      if (!revealSelection) {
        return;
      }

      const elementsMap = app.scene.getNonDeletedElementsMap();
      const currentFrame = elementsMap.get(revealSelection.frame.id);

      if (!currentFrame || !isFrameElement(currentFrame)) {
        return;
      }

      app.scene.mutateElement(currentFrame, {
        customData: buildFramePresentationCustomData(currentFrame, {
          reveals: updater(currentFrame, elementsMap),
        }),
      });
      setRevealMetadataVersion((version) => version + 1);
    },
    [app.scene, revealSelection],
  );

  const handleSetRevealEffect = useCallback(
    (effect: StoryplanePresentationRevealEffect) => {
      if (!revealSelection) {
        return;
      }

      const { elementIds } = revealSelection;

      updateRevealMetadata((frame) =>
        setPresentationRevealEffects(frame, elementIds, effect),
      );
      setIsEffectMenuOpen(false);
      focusEditor();
    },
    [focusEditor, revealSelection, updateRevealMetadata],
  );

  const handleRemoveRevealEffect = useCallback(() => {
    if (!revealSelection) {
      return;
    }

    const { elements } = revealSelection;

    updateRevealMetadata((frame, elementsMap) => {
      const elementIds = elements.flatMap((element) => [
        ...getPresentationRevealRenderElementIds(element, elementsMap),
      ]);

      return removePresentationReveals(frame, elementIds);
    });
    setIsEffectMenuOpen(false);
    focusEditor();
  }, [focusEditor, revealSelection, updateRevealMetadata]);

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

  const cancelRevealAnimation = useCallback(() => {
    if (revealAnimationFrameRef.current !== null) {
      cancelAnimationFrame(revealAnimationFrameRef.current);
      revealAnimationFrameRef.current = null;
    }
  }, []);

  const animateReveal = useCallback(
    (
      elementId: NonDeletedExcalidrawElement["id"],
      durationMs = PRESENTATION_REVEAL_DURATION,
    ) => {
      cancelRevealAnimation();

      const startTime = performance.now();
      const safeDuration = Math.max(1, durationMs);

      const step = (timestamp: number) => {
        const progress = Math.min(1, (timestamp - startTime) / safeDuration);

        setPresentationState({
          revealAnimation: {
            elementId,
            progress,
            durationMs: safeDuration,
          },
        });

        if (progress < 1) {
          revealAnimationFrameRef.current = requestAnimationFrame(step);
          return;
        }

        revealAnimationFrameRef.current = null;
        setPresentationState({ revealAnimation: null });
      };

      setPresentationState({
        revealAnimation: {
          elementId,
          progress: 0,
          durationMs: safeDuration,
        },
      });
      revealAnimationFrameRef.current = requestAnimationFrame(step);
    },
    [cancelRevealAnimation, setPresentationState],
  );

  useEffect(
    () => () => {
      cancelRevealAnimation();
    },
    [cancelRevealAnimation],
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
          visibleRevealCount: 0,
          revealAnimation: null,
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
        visibleRevealCount: 0,
        revealAnimation: null,
      },
    }));
    cancelRevealAnimation();
    focusEditor();
  }, [cancelRevealAnimation, focusEditor, setAppState]);

  const handleNavigateToFrame = useCallback(
    (frame: PresentationFrame | null, revealCount = 0) => {
      if (!frame) {
        return;
      }

      cancelRevealAnimation();
      setPresentationState({
        currentFrameId: frame.id,
        visibleRevealCount: revealCount,
        revealAnimation: null,
      });
      scrollToFrame(frame);
      focusEditor();
    },
    [cancelRevealAnimation, focusEditor, scrollToFrame, setPresentationState],
  );

  const handleNext = useCallback(() => {
    if (visibleRevealCount < currentFrameReveals.length) {
      const nextReveal = currentFrameReveals[visibleRevealCount];

      setPresentationState({
        visibleRevealCount: visibleRevealCount + 1,
        revealAnimation: null,
      });

      if (isAnimatedRevealEffect(nextReveal.reveal.effect)) {
        animateReveal(
          nextReveal.element.id,
          nextReveal.reveal.durationMs ?? PRESENTATION_REVEAL_DURATION,
        );
      }

      focusEditor();
      return;
    }

    if (nextFrame) {
      handleNavigateToFrame(nextFrame);
    }
  }, [
    animateReveal,
    currentFrameReveals,
    focusEditor,
    handleNavigateToFrame,
    nextFrame,
    setPresentationState,
    visibleRevealCount,
  ]);

  const handlePrevious = useCallback(() => {
    if (visibleRevealCount > 0) {
      cancelRevealAnimation();
      setPresentationState({
        visibleRevealCount: visibleRevealCount - 1,
        revealAnimation: null,
      });
      focusEditor();
      return;
    }

    if (previousFrame) {
      handleNavigateToFrame(
        previousFrame,
        getPresentationFrameReveals(previousFrame, elements).length,
      );
    }
  }, [
    cancelRevealAnimation,
    elements,
    focusEditor,
    handleNavigateToFrame,
    previousFrame,
    setPresentationState,
    visibleRevealCount,
  ]);

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
        visibleRevealCount: 0,
        revealAnimation: null,
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
      visibleRevealCount: 0,
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
        if (nextFrame || visibleRevealCount < currentFrameReveals.length) {
          event.preventDefault();
          handleNext();
        }
        return;
      }

      if (
        event.key === KEYS.ARROW_LEFT ||
        event.key === KEYS.ARROW_UP ||
        event.key === KEYS.PAGE_UP ||
        event.key === KEYS.BACKSPACE
      ) {
        if (previousFrame || visibleRevealCount > 0) {
          event.preventDefault();
          handlePrevious();
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
    currentFrameReveals.length,
    handleExitPresentation,
    handleNavigateToFrame,
    handleNext,
    handlePrevious,
    nextFrame,
    previousFrame,
    visibleFrames,
    visibleRevealCount,
  ]);

  const canNavigatePrevious = !!previousFrame || visibleRevealCount > 0;
  const canNavigateNext =
    !!nextFrame || visibleRevealCount < currentFrameReveals.length;

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
          <DropdownMenu open={isEffectMenuOpen}>
            <DropdownMenu.Trigger
              aria-label={t("presentation.effect")}
              className={clsx("FramePresentation__toolButton", {
                "FramePresentation__toolButton--selected": isEffectMenuOpen,
              })}
              data-testid="toolbar-presentation-effect"
              disabled={!revealSelection}
              onToggle={handleEffectMenuToggle}
              title={t("presentation.effect")}
            >
              {MagicIcon}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              className="FramePresentation__effectDropdown"
              onClickOutside={() => setIsEffectMenuOpen(false)}
              onSelect={() => setIsEffectMenuOpen(false)}
            >
              <DropdownMenu.Item
                data-testid="presentation-effect-none"
                onSelect={handleRemoveRevealEffect}
                selected={!selectedRevealState.hasReveal}
              >
                {t("presentation.effectNone")}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                data-testid="presentation-effect-appear"
                onSelect={() => handleSetRevealEffect("appear")}
                selected={selectedRevealState.effect === "appear"}
              >
                {t("presentation.effectAppear")}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                data-testid="presentation-effect-disappear"
                onSelect={() => handleSetRevealEffect("disappear")}
                selected={selectedRevealState.effect === "disappear"}
              >
                {t("presentation.effectDisappear")}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                data-testid="presentation-effect-fade-in"
                onSelect={() => handleSetRevealEffect("fadeIn")}
                selected={
                  selectedRevealState.effect === "fadeIn" ||
                  selectedRevealState.effect === "fade"
                }
              >
                {t("presentation.effectFadeIn")}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                data-testid="presentation-effect-fade-out"
                onSelect={() => handleSetRevealEffect("fadeOut")}
                selected={selectedRevealState.effect === "fadeOut"}
              >
                {t("presentation.effectFadeOut")}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
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
                  disabled={!canNavigatePrevious}
                  icon={chevronLeftIcon}
                  onClick={handlePrevious}
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
                  disabled={!canNavigateNext}
                  icon={chevronRight}
                  onClick={handleNext}
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
