import { isElementInViewport } from "@excalidraw/element";

import { memoize, toBrandedType } from "@excalidraw/common";

import type {
  ExcalidrawElement,
  NonDeletedElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { Scene } from "@excalidraw/element";

import { renderStaticSceneThrottled } from "../renderer/staticScene";
import { getPresentationRevealRenderState } from "../presentation/framePresentation";

import type { RenderableElementsMap } from "./types";

import type { AppState } from "../types";

export class Renderer {
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public getRenderableElements = (() => {
    const getVisibleCanvasElements = ({
      elementsMap,
      zoom,
      offsetLeft,
      offsetTop,
      scrollX,
      scrollY,
      height,
      width,
    }: {
      elementsMap: NonDeletedElementsMap;
      zoom: AppState["zoom"];
      offsetLeft: AppState["offsetLeft"];
      offsetTop: AppState["offsetTop"];
      scrollX: AppState["scrollX"];
      scrollY: AppState["scrollY"];
      height: AppState["height"];
      width: AppState["width"];
    }): readonly NonDeletedExcalidrawElement[] => {
      const visibleElements: NonDeletedExcalidrawElement[] = [];
      for (const element of elementsMap.values()) {
        if (
          isElementInViewport(
            element,
            width,
            height,
            {
              zoom,
              offsetLeft,
              offsetTop,
              scrollX,
              scrollY,
            },
            elementsMap,
          )
        ) {
          visibleElements.push(element);
        }
      }
      return visibleElements;
    };

    const getRenderableElements = ({
      elements,
      editingTextElement,
      newElementId,
      presentationMode,
    }: {
      elements: readonly NonDeletedExcalidrawElement[];
      editingTextElement: AppState["editingTextElement"];
      newElementId: ExcalidrawElement["id"] | undefined;
      presentationMode: AppState["presentationMode"];
    }) => {
      const elementsMap = toBrandedType<RenderableElementsMap>(new Map());
      const { hiddenElementIds, opacityByElementId } =
        getPresentationRevealRenderState(elements, presentationMode);

      for (const element of elements) {
        if (newElementId === element.id) {
          continue;
        }

        if (hiddenElementIds.has(element.id)) {
          continue;
        }

        // we don't want to render text element that's being currently edited
        // (it's rendered on remote only)
        if (
          !editingTextElement ||
          editingTextElement.type !== "text" ||
          element.id !== editingTextElement.id
        ) {
          const opacityFactor = opacityByElementId.get(element.id);

          elementsMap.set(
            element.id,
            opacityFactor === undefined
              ? element
              : {
                  ...element,
                  opacity: Math.max(
                    0,
                    Math.min(100, Math.round(element.opacity * opacityFactor)),
                  ),
                },
          );
        }
      }
      return elementsMap;
    };

    return memoize(
      ({
        zoom,
        offsetLeft,
        offsetTop,
        scrollX,
        scrollY,
        height,
        width,
        editingTextElement,
        newElementId,
        presentationMode,
        // cache-invalidation nonce
        sceneNonce: _sceneNonce,
      }: {
        zoom: AppState["zoom"];
        offsetLeft: AppState["offsetLeft"];
        offsetTop: AppState["offsetTop"];
        scrollX: AppState["scrollX"];
        scrollY: AppState["scrollY"];
        height: AppState["height"];
        width: AppState["width"];
        editingTextElement: AppState["editingTextElement"];
        /** note: first render of newElement will always bust the cache
         * (we'd have to prefilter elements outside of this function) */
        newElementId: ExcalidrawElement["id"] | undefined;
        presentationMode: AppState["presentationMode"];
        sceneNonce: ReturnType<InstanceType<typeof Scene>["getSceneNonce"]>;
      }) => {
        const elements = this.scene.getNonDeletedElements();

        const elementsMap = getRenderableElements({
          elements,
          editingTextElement,
          newElementId,
          presentationMode,
        });

        const visibleElements = getVisibleCanvasElements({
          elementsMap,
          zoom,
          offsetLeft,
          offsetTop,
          scrollX,
          scrollY,
          height,
          width,
        });

        return { elementsMap, visibleElements };
      },
    );
  })();

  // NOTE Doesn't destroy everything (scene, rc, etc.) because it may not be
  // safe to break TS contract here (for upstream cases)
  public destroy() {
    renderStaticSceneThrottled.cancel();
    this.getRenderableElements.clear();
  }
}
