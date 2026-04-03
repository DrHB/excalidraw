import { queryByTestId } from "@testing-library/react";
import { pointFrom } from "@excalidraw/math";

import {
  COLOR_PALETTE,
  DEFAULT_ELEMENT_BACKGROUND_PICKS,
  FONT_FAMILY,
  STROKE_WIDTH,
} from "@excalidraw/common";

import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { UI } from "../tests/helpers/ui";
import { act, render } from "../tests/test-utils";

describe("element locking", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
  });

  describe("properties when tool selected", () => {
    it("should show active background top picks", () => {
      UI.clickTool("rectangle");

      const color = DEFAULT_ELEMENT_BACKGROUND_PICKS[1];

      // just in case we change it in the future
      expect(color).not.toBe(COLOR_PALETTE.transparent);

      API.setAppState({
        currentItemBackgroundColor: color,
      });
      const activeColor = queryByTestId(
        document.body,
        `color-top-pick-${color}`,
      );
      expect(activeColor).toHaveClass("active");
    });

    it("should show fill style when background non-transparent", () => {
      UI.clickTool("rectangle");

      const color = DEFAULT_ELEMENT_BACKGROUND_PICKS[1];

      // just in case we change it in the future
      expect(color).not.toBe(COLOR_PALETTE.transparent);

      API.setAppState({
        currentItemBackgroundColor: color,
        currentItemFillStyle: "hachure",
      });
      const hachureFillButton = queryByTestId(document.body, `fill-hachure`);

      expect(hachureFillButton).toHaveClass("active");
      API.setAppState({
        currentItemFillStyle: "solid",
      });
      const solidFillStyle = queryByTestId(document.body, `fill-solid`);
      expect(solidFillStyle).toHaveClass("active");
    });

    it("should not show fill style when background transparent", () => {
      UI.clickTool("rectangle");

      API.setAppState({
        currentItemBackgroundColor: COLOR_PALETTE.transparent,
        currentItemFillStyle: "hachure",
      });
      const hachureFillButton = queryByTestId(document.body, `fill-hachure`);

      expect(hachureFillButton).toBe(null);
    });

    it("should show horizontal text align for text tool", () => {
      UI.clickTool("text");

      API.setAppState({
        currentItemTextAlign: "right",
      });

      const centerTextAlign = queryByTestId(document.body, `align-right`);
      expect(centerTextAlign).toBeChecked();
    });

    it("should show the active freedraw stroke type", () => {
      UI.clickTool("freedraw");

      API.setAppState({
        currentItemStrokeShape: "fixed",
      });

      const fixedStrokeShape = queryByTestId(
        document.body,
        "strokeShape-fixed",
      );
      expect(fixedStrokeShape).toBeChecked();
    });
  });

  describe("properties when elements selected", () => {
    it("should show active styles when single element selected", () => {
      const rect = API.createElement({
        type: "rectangle",
        backgroundColor: "red",
        fillStyle: "cross-hatch",
      });
      API.setElements([rect]);
      API.setSelectedElements([rect]);

      const crossHatchButton = queryByTestId(document.body, `fill-cross-hatch`);
      expect(crossHatchButton).toHaveClass("active");
    });

    it("should not show fill style selected element's background is transparent", () => {
      const rect = API.createElement({
        type: "rectangle",
        backgroundColor: COLOR_PALETTE.transparent,
        fillStyle: "cross-hatch",
      });
      API.setElements([rect]);
      API.setSelectedElements([rect]);

      const crossHatchButton = queryByTestId(document.body, `fill-cross-hatch`);
      expect(crossHatchButton).toBe(null);
    });

    it("should highlight common stroke width of selected elements", () => {
      const rect1 = API.createElement({
        type: "rectangle",
        strokeWidth: STROKE_WIDTH.thin,
      });
      const rect2 = API.createElement({
        type: "rectangle",
        strokeWidth: STROKE_WIDTH.thin,
      });
      API.setElements([rect1, rect2]);
      API.setSelectedElements([rect1, rect2]);

      const thinStrokeWidthButton = queryByTestId(
        document.body,
        `strokeWidth-thin`,
      );
      expect(thinStrokeWidthButton).toBeChecked();
    });

    it("should not highlight any stroke width button if no common style", () => {
      const rect1 = API.createElement({
        type: "rectangle",
        strokeWidth: STROKE_WIDTH.thin,
      });
      const rect2 = API.createElement({
        type: "rectangle",
        strokeWidth: STROKE_WIDTH.bold,
      });
      API.setElements([rect1, rect2]);
      API.setSelectedElements([rect1, rect2]);

      expect(queryByTestId(document.body, `strokeWidth-thin`)).not.toBe(null);
      expect(
        queryByTestId(document.body, `strokeWidth-thin`),
      ).not.toBeChecked();
      expect(
        queryByTestId(document.body, `strokeWidth-medium`),
      ).not.toBeChecked();
      expect(
        queryByTestId(document.body, `strokeWidth-bold`),
      ).not.toBeChecked();
      expect(
        queryByTestId(document.body, `strokeWidth-extraBold`),
      ).not.toBeChecked();
    });

    it("should show properties of different element types when selected", () => {
      const rect = API.createElement({
        type: "rectangle",
        strokeWidth: STROKE_WIDTH.bold,
      });
      const text = API.createElement({
        type: "text",
        strokeWidth: STROKE_WIDTH.bold,
        fontFamily: FONT_FAMILY["Comic Shanns"],
      });
      API.setElements([rect, text]);
      API.setSelectedElements([rect, text]);

      expect(queryByTestId(document.body, `strokeWidth-bold`)).toBeChecked();
      expect(queryByTestId(document.body, `font-family-code`)).toHaveClass(
        "active",
      );
    });

    it("should highlight the fixed freedraw stroke type for selected elements", () => {
      const freedraw = API.createElement({
        type: "freedraw",
        strokeShape: "fixed",
        points: [pointFrom(0, 0), pointFrom(10, 10), pointFrom(20, 15)],
      });
      API.setElements([freedraw]);
      API.setSelectedElements([freedraw]);

      const fixedStrokeShape = queryByTestId(
        document.body,
        "strokeShape-fixed",
      );
      expect(fixedStrokeShape).toBeChecked();
    });

    it("should apply fixed freedraw stroke type to newly drawn strokes", () => {
      UI.clickTool("freedraw");

      act(() => {
        queryByTestId(document.body, "strokeShape-fixed")?.click();
      });

      const freedraw = UI.createElement("freedraw", {
        points: [pointFrom(0, 0), pointFrom(10, 10), pointFrom(20, 15)],
      });

      expect(freedraw.strokeShape).toBe("fixed");
    });
  });
});
