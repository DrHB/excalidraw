import { COLOR_PALETTE } from "@excalidraw/common";
import { exportToSvg } from "@excalidraw/utils/export";
import { useEffect, useState } from "react";

import type {
  ExcalidrawFrameElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { getPresentationFramePreviewElements } from "../presentation/framePresentation";

import type { AppState, BinaryFiles } from "../types";

type PresentationFrameSvgCacheEntry = {
  signature: string;
  svg: SVGSVGElement;
};

const presentationFrameSvgCache = new Map<
  ExcalidrawFrameElement["id"],
  PresentationFrameSvgCacheEntry
>();

export const usePresentationFrameSvg = ({
  enabled,
  elements,
  exportWithDarkMode,
  files,
  frame,
  ref,
  signature,
  viewBackgroundColor,
}: {
  enabled: boolean;
  elements: readonly NonDeletedExcalidrawElement[];
  exportWithDarkMode: boolean;
  files: BinaryFiles;
  frame: NonDeleted<ExcalidrawFrameElement>;
  ref: React.RefObject<HTMLDivElement | null>;
  signature: string;
  viewBackgroundColor: AppState["viewBackgroundColor"];
}) => {
  const [svg, setSvg] = useState<SVGSVGElement>();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const cachedSvg = presentationFrameSvgCache.get(frame.id);
    if (cachedSvg?.signature === signature) {
      setSvg(cachedSvg.svg);
      return;
    }

    let cancelled = false;

    (async () => {
      const previewElements = getPresentationFramePreviewElements(
        elements,
        frame,
      );
      const exportedSvg = await exportToSvg({
        elements: previewElements,
        appState: {
          exportBackground: true,
          exportWithDarkMode,
          viewBackgroundColor: viewBackgroundColor || COLOR_PALETTE.white,
        },
        exportPadding: 0,
        exportingFrame: frame,
        files,
        renderEmbeddables: false,
        reuseImages: true,
        skipInliningFonts: true,
      });

      exportedSvg.querySelector(".style-fonts")?.remove();

      if (cancelled) {
        return;
      }

      presentationFrameSvgCache.set(frame.id, {
        signature,
        svg: exportedSvg,
      });
      setSvg(exportedSvg);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    elements,
    enabled,
    exportWithDarkMode,
    files,
    frame,
    signature,
    viewBackgroundColor,
  ]);

  useEffect(() => {
    const node = ref.current;

    if (!node) {
      return;
    }

    node.innerHTML = svg ? svg.outerHTML : "";

    return () => {
      node.innerHTML = "";
    };
  }, [ref, svg]);

  return svg;
};

export const clearPresentationFrameSvgCache = () => {
  presentationFrameSvgCache.clear();
};
