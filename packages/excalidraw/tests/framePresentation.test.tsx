import React from "react";

import { KEYS } from "@excalidraw/common";

import { buildFramePresentationCustomData } from "../presentation/framePresentation";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import {
  fireEvent,
  queryByTestId,
  render,
  unmountComponent,
  waitFor,
} from "./test-utils";

const { h } = window;

afterEach(() => {
  unmountComponent();
});

const createFrames = () => {
  const frameA = API.createElement({ type: "frame", x: 100, y: 100, width: 240, height: 160 });
  const frameB = API.createElement({ type: "frame", x: 420, y: 100, width: 240, height: 160 });
  const frameC = API.createElement({ type: "frame", x: 740, y: 100, width: 240, height: 160 });

  API.updateScene({
    elements: [frameA, frameB, frameC],
  });

  API.updateElement(frameA, {
    customData: buildFramePresentationCustomData(frameA, { order: 0, title: "A" }),
  });
  API.updateElement(frameB, {
    customData: buildFramePresentationCustomData(frameB, { order: 1, title: "B" }),
  });
  API.updateElement(frameC, {
    customData: buildFramePresentationCustomData(frameC, { order: 2, title: "C" }),
  });

  return { frameA, frameB, frameC };
};

describe("frame presentation UI", () => {
  it("activates the frame tool from the Draw Frames button", async () => {
    const { container } = await render(<Excalidraw />);

    fireEvent.click(queryByTestId(container, "toolbar-draw-frames")!);

    expect(h.state.activeTool.type).toBe("frame");
  });

  it("enables Present when visible frames exist", async () => {
    const { container } = await render(<Excalidraw />);

    expect(queryByTestId(container, "toolbar-present")).toBeDisabled();

    createFrames();

    await waitFor(() => {
      expect(queryByTestId(container, "toolbar-present")).not.toBeDisabled();
    });
  });

  it("navigates next and previous in presentation order", async () => {
    const { container } = await render(<Excalidraw />);
    const { frameA, frameB } = createFrames();

    fireEvent.click(queryByTestId(container, "toolbar-present")!);

    await waitFor(() => {
      expect(h.state.presentationMode.active).toBe(true);
      expect(h.state.presentationMode.currentFrameId).toBe(frameA.id);
    });

    fireEvent.click(queryByTestId(container, "presentation-next")!);
    expect(h.state.presentationMode.currentFrameId).toBe(frameB.id);

    fireEvent.click(queryByTestId(container, "presentation-previous")!);
    expect(h.state.presentationMode.currentFrameId).toBe(frameA.id);
  });

  it("exits presentation mode on Escape", async () => {
    const { container } = await render(<Excalidraw />);
    createFrames();

    fireEvent.click(queryByTestId(container, "toolbar-present")!);

    await waitFor(() => {
      expect(h.state.presentationMode.active).toBe(true);
    });

    fireEvent.keyDown(window, { key: KEYS.ESCAPE });

    await waitFor(() => {
      expect(h.state.presentationMode.active).toBe(false);
      expect(h.state.presentationMode.currentFrameId).toBe(null);
    });
  });

  it("updates frame metadata when reordering from the path panel", async () => {
    const { container } = await render(<Excalidraw />);
    const { frameA, frameB } = createFrames();

    fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="presentation-frame-path-panel"]'),
      ).not.toBe(null);
    });

    fireEvent.click(
      document.querySelector(
        `[data-testid="presentation-move-down-${frameA.id}"]`,
      )!,
    );

    await waitFor(() => {
      expect(
        API.getElement(frameA).customData?.storyplanePresentation?.order,
      ).toBe(1);
      expect(
        API.getElement(frameB).customData?.storyplanePresentation?.order,
      ).toBe(0);
    });
  });
});
