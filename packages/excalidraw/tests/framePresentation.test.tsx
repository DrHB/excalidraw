import React from "react";

import {
  DEFAULT_SIDEBAR,
  KEYS,
  PRESENTATION_SIDEBAR_TAB,
} from "@excalidraw/common";

import { buildFramePresentationCustomData } from "../presentation/framePresentation";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import {
  fireEvent,
  queryByTestId,
  render,
  unmountComponent,
  waitFor,
  withExcalidrawDimensions,
} from "./test-utils";

const { h } = window;

afterEach(() => {
  unmountComponent();
});

const createPresentationFrame = (x: number) =>
  API.createElement({
    type: "frame",
    x,
    y: 100,
    width: 240,
    height: 160,
  });

const createFrames = () => {
  const frameA = createPresentationFrame(100);
  const frameB = createPresentationFrame(420);
  const frameC = createPresentationFrame(740);

  API.updateScene({
    elements: [frameA, frameB, frameC],
  });

  API.updateElement(frameA, {
    customData: buildFramePresentationCustomData(frameA, {
      order: 0,
      title: "A",
    }),
  });
  API.updateElement(frameB, {
    customData: buildFramePresentationCustomData(frameB, {
      order: 1,
      title: "B",
    }),
  });
  API.updateElement(frameC, {
    customData: buildFramePresentationCustomData(frameC, {
      order: 2,
      title: "C",
    }),
  });

  return { frameA, frameB, frameC };
};

const createDataTransfer = () => {
  const data = new Map<string, string>();

  return {
    dropEffect: "move",
    getData: jest.fn((type: string) => data.get(type) ?? ""),
    setData: jest.fn((type: string, value: string) => {
      data.set(type, value);
    }),
  } as unknown as DataTransfer;
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

  it("opens the presentation sidebar tab from the Frame Path button", async () => {
    const { container } = await render(<Excalidraw />);
    createFrames();

    fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

    await waitFor(() => {
      expect(h.state.openSidebar).toEqual({
        name: DEFAULT_SIDEBAR.name,
        tab: PRESENTATION_SIDEBAR_TAB,
      });
    });

    expect(queryByTestId(container, "presentation-sidebar")).not.toBe(null);
  });

  it("auto-opens the organizer once when the first frame is created", async () => {
    const { container } = await render(<Excalidraw />);

    expect(h.state.openSidebar).toBe(null);

    fireEvent.click(queryByTestId(container, "toolbar-draw-frames")!);

    const frameA = API.createElement({
      type: "frame",
      x: 100,
      y: 100,
      width: 240,
      height: 160,
    });

    API.updateScene({ elements: [frameA] });

    await waitFor(() => {
      expect(h.state.openSidebar).toEqual({
        name: DEFAULT_SIDEBAR.name,
        tab: PRESENTATION_SIDEBAR_TAB,
      });
    });

    API.setAppState({ openSidebar: null });
    API.updateScene({ elements: [] });

    const frameB = API.createElement({
      type: "frame",
      x: 420,
      y: 100,
      width: 240,
      height: 160,
    });

    API.updateScene({ elements: [frameB] });

    await waitFor(() => {
      expect(h.state.openSidebar).toBe(null);
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

  it("clicking a sidebar row in edit mode jumps to and selects the frame", async () => {
    const { container } = await render(<Excalidraw />);
    const { frameB } = createFrames();

    fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

    await waitFor(() => {
      expect(
        queryByTestId(container, `presentation-frame-row-${frameB.id}`),
      ).not.toBe(null);
    });

    fireEvent.click(
      queryByTestId(container, `presentation-frame-row-${frameB.id}`)!,
    );

    await waitFor(() => {
      expect(h.state.selectedElementIds).toEqual({ [frameB.id]: true });
      expect(h.state.activeTool.type).toBe("selection");
    });
  });

  it("clicking a sidebar row in presentation mode navigates to that frame", async () => {
    const { container } = await render(<Excalidraw />);
    const { frameA, frameC } = createFrames();

    fireEvent.click(queryByTestId(container, "toolbar-present")!);

    await waitFor(() => {
      expect(h.state.presentationMode.currentFrameId).toBe(frameA.id);
    });

    fireEvent.click(
      queryByTestId(container, "presentation-frame-path-toggle")!,
    );

    await waitFor(() => {
      expect(h.state.openSidebar).toEqual({
        name: DEFAULT_SIDEBAR.name,
        tab: PRESENTATION_SIDEBAR_TAB,
      });
    });

    fireEvent.click(
      queryByTestId(container, `presentation-frame-row-${frameC.id}`)!,
    );

    await waitFor(() => {
      expect(h.state.presentationMode.currentFrameId).toBe(frameC.id);
    });
  });

  it("updates frame metadata when reordering from the organizer drag and drop", async () => {
    const { container } = await render(<Excalidraw />);
    const { frameA, frameB, frameC } = createFrames();

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

      await waitFor(() => {
        expect(
          queryByTestId(container, `presentation-frame-row-${frameA.id}`),
        ).not.toBe(null);
      });

      const rowC = queryByTestId(
        container,
        `presentation-frame-row-${frameC.id}`,
      )!;
      rowC.getBoundingClientRect = () =>
        ({
          top: -100,
          left: 0,
          width: 400,
          height: 80,
          bottom: -20,
          right: 400,
          x: 0,
          y: -100,
          toJSON: () => {},
        } as DOMRect);

      const dataTransfer = createDataTransfer();

      fireEvent.dragStart(
        queryByTestId(container, `presentation-drag-${frameA.id}`)!,
        { dataTransfer },
      );
      fireEvent.dragOver(rowC, { clientY: 70, dataTransfer });

      await waitFor(() => {
        expect(rowC.className).toContain(
          "PresentationSidebar__row--dropBefore",
        );
      });

      fireEvent.drop(rowC, { clientY: 70, dataTransfer });

      await waitFor(() => {
        expect(
          API.getElement(frameA).customData?.storyplanePresentation?.order,
        ).toBe(1);
        expect(
          API.getElement(frameB).customData?.storyplanePresentation?.order,
        ).toBe(0);
        expect(
          API.getElement(frameC).customData?.storyplanePresentation?.order,
        ).toBe(2);
      });
    });
  });
});
