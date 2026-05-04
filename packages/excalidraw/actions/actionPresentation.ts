import { CaptureUpdateAction } from "@excalidraw/element";

import {
  buildFramePresentationCustomData,
  getPresentationRevealRenderElementIds,
  getPresentationRevealSelection,
  getPresentationReveals,
  removePresentationReveals,
  setPresentationRevealEffects,
} from "../presentation/framePresentation";

import { register } from "./register";

import type { AppClassProperties, AppState } from "../types";
import type { StoryplanePresentationRevealEffect } from "../presentation/framePresentation";

type PresentationRevealEffectFormData = {
  effect?: StoryplanePresentationRevealEffect;
};

const getRevealSelection = (
  appState: Readonly<AppState>,
  app: AppClassProperties,
) =>
  getPresentationRevealSelection(
    app.scene.getSelectedElements(appState),
    app.scene.getNonDeletedElementsMap(),
  );

const selectionHasReveal = (
  appState: Readonly<AppState>,
  app: AppClassProperties,
) => {
  const selection = getRevealSelection(appState, app);

  if (!selection) {
    return false;
  }

  const selectedElementIds = new Set(selection.elementIds);

  return getPresentationReveals(selection.frame).some((reveal) =>
    selectedElementIds.has(reveal.elementId),
  );
};

export const actionAddPresentationReveal =
  register<PresentationRevealEffectFormData>({
    name: "addPresentationReveal",
    label: "presentation.addReveal",
    trackEvent: { category: "element" },
    predicate: (elements, appState, _, app) =>
      !!getRevealSelection(appState, app),
    perform: (elements, appState, formData, app) => {
      const selection = getRevealSelection(appState, app);

      if (!selection) {
        return {
          elements,
          appState,
          captureUpdate: CaptureUpdateAction.EVENTUALLY,
        };
      }

      app.scene.mutateElement(selection.frame, {
        customData: buildFramePresentationCustomData(selection.frame, {
          reveals: setPresentationRevealEffects(
            selection.frame,
            selection.elementIds,
            formData?.effect ?? "appear",
          ),
        }),
      });

      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    },
  });

export const actionRemovePresentationReveal = register({
  name: "removePresentationReveal",
  label: "presentation.removeReveal",
  trackEvent: { category: "element" },
  predicate: (elements, appState, _, app) => selectionHasReveal(appState, app),
  perform: (elements, appState, _, app) => {
    const selection = getRevealSelection(appState, app);

    if (!selection) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const elementsMap = app.scene.getNonDeletedElementsMap();
    const elementIds = selection.elements.flatMap((element) => [
      ...getPresentationRevealRenderElementIds(element, elementsMap),
    ]);

    app.scene.mutateElement(selection.frame, {
      customData: buildFramePresentationCustomData(selection.frame, {
        reveals: removePresentationReveals(selection.frame, elementIds),
      }),
    });

    return {
      elements,
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});
