import { COLOR_PALETTE } from "@excalidraw/common";
import { exportToSvg } from "@excalidraw/utils/export";
import { useEffect, useState } from "react";

import type {
  ExcalidrawFrameElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { BinaryFiles } from "../types";

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
  files,
  frame,
  ref,
  signature,
}: {
  enabled: boolean;
  elements: readonly NonDeletedExcalidrawElement[];
  files: BinaryFiles;
  frame: NonDeleted<ExcalidrawFrameElement>;
  ref: React.RefObject<HTMLDivElement | null>;
  signature: string;
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
      const exportedSvg = await exportToSvg({
        elements,
        appState: {
          exportBackground: false,
          viewBackgroundColor: COLOR_PALETTE.white,
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
  }, [elements, enabled, files, frame, signature]);

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
