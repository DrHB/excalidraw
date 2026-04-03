import React from "react";

import { Excalidraw } from "../index";
import { API } from "./helpers/api";
import { Pointer, UI } from "./helpers/ui";
import { render } from "./test-utils";

describe("freedraw", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
  });

  it("rounds stored points and drops duplicates after rounding", () => {
    const mouse = new Pointer("mouse");

    UI.clickTool("freedraw");
    mouse.downAt(10, 20);
    mouse.moveTo(10.1234, 20.5678);
    mouse.moveTo(10.1249, 20.5681);
    mouse.upAt(20.9999, 30.0001);

    const freedraw = window.h.elements.at(-1);

    expect(freedraw).toEqual(expect.objectContaining({ type: "freedraw" }));
    expect((freedraw as any).points).toEqual([
      [0, 0],
      [0.12, 0.57],
      [11, 10],
    ]);
  });

  it("does not snap fixed strokes closed when ending near the start point", () => {
    const mouse = new Pointer("mouse");

    API.setAppState({ currentItemStrokeShape: "fixed" });
    UI.clickTool("freedraw");
    mouse.downAt(10, 10);
    mouse.moveTo(40, 10);
    mouse.moveTo(30, 30);
    mouse.upAt(12, 12);

    const freedraw = window.h.elements.at(-1) as any;

    expect(freedraw.points[0]).toEqual([0, 0]);
    expect(freedraw.points.at(-1)).not.toEqual([0, 0]);
  });

  it("coalesces nearly straight fixed freedraw points at the tip", () => {
    const mouse = new Pointer("mouse");

    API.setAppState({ currentItemStrokeShape: "fixed" });
    UI.clickTool("freedraw");
    mouse.downAt(10, 10);

    [
      [10.2, 10.01],
      [10.4, 10.03],
      [10.6, 10.02],
      [10.8, 10.04],
      [11, 10.03],
      [11.2, 10.05],
      [11.4, 10.04],
      [11.6, 10.06],
      [11.8, 10.05],
    ].forEach(([x, y]) => {
      mouse.moveTo(x, y);
    });
    mouse.upAt(12, 10.05);

    const freedraw = window.h.elements.at(-1) as any;

    expect(freedraw.points.length).toBeLessThan(5);
    expect(freedraw.points).toEqual([
      [0, 0],
      [2, 0.05],
    ]);
  });
});
