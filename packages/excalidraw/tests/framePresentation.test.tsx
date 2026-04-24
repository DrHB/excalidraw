import React from "react";

import {
  DEFAULT_SIDEBAR,
  KEYS,
  PRESENTATION_SIDEBAR_TAB,
} from "@excalidraw/common";

import { actionDeleteSelected } from "../actions/actionDeleteSelected";
import {
  actionAddPresentationReveal,
  actionRemovePresentationReveal,
} from "../actions/actionPresentation";
import { buildFramePresentationCustomData } from "../presentation/framePresentation";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import {
  fireEvent,
  GlobalTestState,
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

  it("sets and removes reveal effects from the presentation toolbar", async () => {
    const { container } = await render(<Excalidraw />);
    const frame = createPresentationFrame(100);
    const rectangle = API.createElement({
      type: "rectangle",
      x: 140,
      y: 140,
      width: 80,
      height: 48,
      frameId: frame.id,
    });

    API.updateScene({ elements: [frame, rectangle] });

    expect(
      queryByTestId(container, "toolbar-presentation-effect"),
    ).toBeDisabled();

    API.setSelectedElements([rectangle]);

    await waitFor(() => {
      expect(
        queryByTestId(container, "toolbar-presentation-effect"),
      ).not.toBeDisabled();
    });

    fireEvent.click(queryByTestId(container, "toolbar-presentation-effect")!);
    fireEvent.click(queryByTestId(container, "presentation-effect-disappear")!);

    await waitFor(() => {
      expect(
        API.getElement(frame).customData?.storyplanePresentation?.reveals,
      ).toMatchObject([
        {
          elementId: rectangle.id,
          order: 0,
          effect: "disappear",
        },
      ]);
    });

    fireEvent.click(queryByTestId(container, "toolbar-presentation-effect")!);
    fireEvent.click(queryByTestId(container, "presentation-effect-appear")!);

    await waitFor(() => {
      expect(
        API.getElement(frame).customData?.storyplanePresentation?.reveals,
      ).toMatchObject([
        {
          elementId: rectangle.id,
          order: 0,
          effect: "fade",
        },
      ]);
      expect(
        API.getElement(frame).customData?.storyplanePresentation?.reveals,
      ).toHaveLength(1);
    });

    fireEvent.click(queryByTestId(container, "toolbar-presentation-effect")!);
    fireEvent.click(queryByTestId(container, "presentation-effect-remove")!);

    await waitFor(() => {
      expect(
        API.getElement(frame).customData?.storyplanePresentation?.reveals,
      ).toEqual([]);
    });
  });

  it("keeps right-click remove but not add for reveal effects", async () => {
    await render(<Excalidraw />);
    const frame = createPresentationFrame(100);
    const rectangle = API.createElement({
      type: "rectangle",
      x: 140,
      y: 140,
      width: 80,
      height: 48,
      frameId: frame.id,
    });

    API.updateScene({ elements: [frame, rectangle] });
    API.updateElement(frame, {
      customData: buildFramePresentationCustomData(frame, {
        reveals: [{ elementId: rectangle.id, order: 0, effect: "fade" }],
      }),
    });
    API.setSelectedElements([rectangle]);

    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      clientX: 160,
      clientY: 160,
    });

    const contextMenu = await waitFor(() => {
      const menu = document.querySelector(".context-menu") as HTMLElement;
      expect(menu).not.toBe(null);
      return menu;
    });

    expect(queryByTestId(contextMenu, "addPresentationReveal")).toBe(null);
    expect(queryByTestId(contextMenu, "removePresentationReveal")).not.toBe(
      null,
    );
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

  it("uses drag-only reordering controls in the organizer", async () => {
    const { container } = await render(<Excalidraw />);
    const { frameA } = createFrames();

    fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

    await waitFor(() => {
      expect(
        queryByTestId(container, `presentation-drag-${frameA.id}`),
      ).not.toBe(null);
    });

    expect(queryByTestId(container, `presentation-move-up-${frameA.id}`)).toBe(
      null,
    );
    expect(
      queryByTestId(container, `presentation-move-down-${frameA.id}`),
    ).toBe(null);
  });

  it("uses optional title placeholders for unnamed frames in the organizer", async () => {
    const { container } = await render(<Excalidraw />);
    const frame = createPresentationFrame(100);

    API.updateScene({ elements: [frame] });
    fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

    await waitFor(() => {
      expect(
        queryByTestId(container, `presentation-title-${frame.id}`),
      ).toHaveAttribute("placeholder", "Add title");
    });
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

  it("adds and removes Appear effects for frame-owned selections", async () => {
    await render(<Excalidraw />);
    const frame = createPresentationFrame(100);
    const rectangle = API.createElement({
      type: "rectangle",
      x: 140,
      y: 140,
      width: 80,
      height: 48,
      frameId: frame.id,
    });

    API.updateScene({ elements: [frame, rectangle] });
    API.setSelectedElements([rectangle]);
    API.executeAction(actionAddPresentationReveal);

    expect(
      API.getElement(frame).customData?.storyplanePresentation?.reveals,
    ).toMatchObject([
      {
        elementId: rectangle.id,
        order: 0,
        effect: "fade",
      },
    ]);

    API.executeAction(actionRemovePresentationReveal);

    expect(
      API.getElement(frame).customData?.storyplanePresentation?.reveals,
    ).toEqual([]);
  });

  it("renders reveal rows in the organizer and supports removal", async () => {
    const { container } = await render(<Excalidraw />);
    const frame = createPresentationFrame(100);
    const rectangle = API.createElement({
      type: "rectangle",
      x: 140,
      y: 140,
      width: 80,
      height: 48,
      frameId: frame.id,
    });

    API.updateScene({ elements: [frame, rectangle] });
    API.updateElement(frame, {
      customData: buildFramePresentationCustomData(frame, {
        reveals: [{ elementId: rectangle.id, order: 0, effect: "fade" }],
      }),
    });

    fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

    await waitFor(() => {
      expect(
        queryByTestId(container, `presentation-reveal-row-${rectangle.id}`),
      ).not.toBe(null);
    });

    expect(container.textContent).toContain("Appear");

    fireEvent.click(
      queryByTestId(container, `presentation-reveal-remove-${rectangle.id}`)!,
    );

    await waitFor(() => {
      expect(
        API.getElement(frame).customData?.storyplanePresentation?.reveals,
      ).toEqual([]);
      expect(
        queryByTestId(container, `presentation-reveal-row-${rectangle.id}`),
      ).toBe(null);
    });
  });

  it("renders Disappear reveal labels in the organizer", async () => {
    const { container } = await render(<Excalidraw />);
    const frame = createPresentationFrame(100);
    const rectangle = API.createElement({
      type: "rectangle",
      x: 140,
      y: 140,
      width: 80,
      height: 48,
      frameId: frame.id,
    });

    API.updateScene({ elements: [frame, rectangle] });
    API.updateElement(frame, {
      customData: buildFramePresentationCustomData(frame, {
        reveals: [{ elementId: rectangle.id, order: 0, effect: "disappear" }],
      }),
    });

    fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

    await waitFor(() => {
      expect(
        queryByTestId(container, `presentation-reveal-row-${rectangle.id}`),
      ).not.toBe(null);
    });

    expect(container.textContent).toContain("Disappear");
  });

  it("removes text Appear effects from the organizer", async () => {
    const { container } = await render(<Excalidraw />);
    const frame = createPresentationFrame(100);
    const text = API.createElement({
      type: "text",
      x: 140,
      y: 140,
      width: 120,
      height: 32,
      fontSize: 20,
      frameId: frame.id,
      text: "helppp",
    });

    API.updateScene({ elements: [frame, text] });
    API.updateElement(frame, {
      customData: buildFramePresentationCustomData(frame, {
        reveals: [{ elementId: text.id, order: 0, effect: "fade" }],
      }),
    });

    fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

    await waitFor(() => {
      expect(
        queryByTestId(container, `presentation-reveal-remove-${text.id}`),
      ).not.toBe(null);
    });

    fireEvent.pointerUp(
      queryByTestId(container, `presentation-reveal-remove-${text.id}`)!,
    );

    await waitFor(() => {
      expect(
        API.getElement(frame).customData?.storyplanePresentation?.reveals,
      ).toEqual([]);
      expect(
        queryByTestId(container, `presentation-reveal-row-${text.id}`),
      ).toBe(null);
    });
  });

  it("does not render missing reveal targets in the organizer", async () => {
    const { container } = await render(<Excalidraw />);
    const frame = createPresentationFrame(100);
    const rectangle = API.createElement({
      type: "rectangle",
      x: 140,
      y: 140,
      width: 80,
      height: 48,
      frameId: frame.id,
    });

    API.updateScene({ elements: [frame, rectangle] });
    API.updateElement(frame, {
      customData: buildFramePresentationCustomData(frame, {
        reveals: [
          { elementId: "missing-object", order: 0, effect: "fade" },
          { elementId: rectangle.id, order: 1, effect: "fade" },
        ],
      }),
    });

    fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

    await waitFor(() => {
      expect(
        queryByTestId(container, `presentation-reveal-row-${rectangle.id}`),
      ).not.toBe(null);
    });

    expect(
      queryByTestId(container, "presentation-reveal-row-missing-object"),
    ).toBe(null);
    expect(container.textContent).not.toContain("Missing");
  });

  it("delete removes an Appear effect before deleting the object", async () => {
    await render(<Excalidraw />);
    const frame = createPresentationFrame(100);
    const rectangle = API.createElement({
      type: "rectangle",
      x: 140,
      y: 140,
      width: 80,
      height: 48,
      frameId: frame.id,
    });

    API.updateScene({ elements: [frame, rectangle] });
    API.updateElement(frame, {
      customData: buildFramePresentationCustomData(frame, {
        reveals: [{ elementId: rectangle.id, order: 0, effect: "fade" }],
      }),
    });
    API.setSelectedElements([rectangle]);

    API.executeAction(actionDeleteSelected);

    expect(API.getElement(rectangle).isDeleted).toBe(false);
    expect(
      API.getElement(frame).customData?.storyplanePresentation?.reveals,
    ).toEqual([]);

    API.executeAction(actionDeleteSelected);

    expect(API.getElement(rectangle).isDeleted).toBe(true);
  });

  it("reorders reveal metadata from the organizer fallback buttons", async () => {
    const { container } = await render(<Excalidraw />);
    const frame = createPresentationFrame(100);
    const rectangleA = API.createElement({
      type: "rectangle",
      x: 140,
      y: 140,
      width: 80,
      height: 48,
      frameId: frame.id,
    });
    const rectangleB = API.createElement({
      type: "ellipse",
      x: 240,
      y: 140,
      width: 80,
      height: 48,
      frameId: frame.id,
    });

    API.updateScene({ elements: [frame, rectangleA, rectangleB] });
    API.updateElement(frame, {
      customData: buildFramePresentationCustomData(frame, {
        reveals: [
          { elementId: rectangleA.id, order: 0, effect: "fade" },
          { elementId: rectangleB.id, order: 1, effect: "fade" },
        ],
      }),
    });

    fireEvent.click(queryByTestId(container, "toolbar-frame-path")!);

    await waitFor(() => {
      expect(
        queryByTestId(container, `presentation-reveal-row-${rectangleA.id}`),
      ).not.toBe(null);
    });

    fireEvent.click(
      queryByTestId(
        container,
        `presentation-reveal-move-down-${rectangleA.id}`,
      )!,
    );

    await waitFor(() => {
      expect(
        API.getElement(frame).customData?.storyplanePresentation?.reveals.map(
          (reveal: { elementId: string }) => reveal.elementId,
        ),
      ).toEqual([rectangleB.id, rectangleA.id]);
    });
  });

  it("reveals objects before advancing to the next frame", async () => {
    const { container } = await render(<Excalidraw />);
    const frameA = createPresentationFrame(100);
    const frameB = createPresentationFrame(420);
    const rectangle = API.createElement({
      type: "rectangle",
      x: 140,
      y: 140,
      width: 80,
      height: 48,
      frameId: frameA.id,
    });

    API.updateScene({ elements: [frameA, frameB, rectangle] });
    API.updateElement(frameA, {
      customData: buildFramePresentationCustomData(frameA, {
        order: 0,
        reveals: [{ elementId: rectangle.id, order: 0, effect: "fade" }],
      }),
    });
    API.updateElement(frameB, {
      customData: buildFramePresentationCustomData(frameB, { order: 1 }),
    });

    fireEvent.click(queryByTestId(container, "toolbar-present")!);

    await waitFor(() => {
      expect(h.state.presentationMode.currentFrameId).toBe(frameA.id);
      expect(h.state.presentationMode.visibleRevealCount).toBe(0);
    });

    fireEvent.click(queryByTestId(container, "presentation-next")!);

    expect(h.state.presentationMode.currentFrameId).toBe(frameA.id);
    expect(h.state.presentationMode.visibleRevealCount).toBe(1);

    fireEvent.click(queryByTestId(container, "presentation-next")!);

    expect(h.state.presentationMode.currentFrameId).toBe(frameB.id);
    expect(h.state.presentationMode.visibleRevealCount).toBe(0);
  });

  it("hides reveals before moving backward", async () => {
    const { container } = await render(<Excalidraw />);
    const frameA = createPresentationFrame(100);
    const frameB = createPresentationFrame(420);
    const rectangle = API.createElement({
      type: "rectangle",
      x: 140,
      y: 140,
      width: 80,
      height: 48,
      frameId: frameA.id,
    });

    API.updateScene({ elements: [frameA, frameB, rectangle] });
    API.updateElement(frameA, {
      customData: buildFramePresentationCustomData(frameA, {
        order: 0,
        reveals: [{ elementId: rectangle.id, order: 0, effect: "fade" }],
      }),
    });
    API.updateElement(frameB, {
      customData: buildFramePresentationCustomData(frameB, { order: 1 }),
    });

    fireEvent.click(queryByTestId(container, "toolbar-present")!);

    await waitFor(() => {
      expect(h.state.presentationMode.currentFrameId).toBe(frameA.id);
    });

    fireEvent.click(queryByTestId(container, "presentation-next")!);
    fireEvent.click(queryByTestId(container, "presentation-next")!);
    expect(h.state.presentationMode.currentFrameId).toBe(frameB.id);

    fireEvent.click(queryByTestId(container, "presentation-previous")!);
    expect(h.state.presentationMode.currentFrameId).toBe(frameA.id);
    expect(h.state.presentationMode.visibleRevealCount).toBe(1);

    fireEvent.click(queryByTestId(container, "presentation-previous")!);
    expect(h.state.presentationMode.currentFrameId).toBe(frameA.id);
    expect(h.state.presentationMode.visibleRevealCount).toBe(0);
  });
});
