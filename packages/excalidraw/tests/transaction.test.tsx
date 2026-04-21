import React from "react";

import { arrayToMap } from "@excalidraw/common";
import { CaptureUpdateAction, newElementWith } from "@excalidraw/element";

import type { ElementUpdate } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { TransactionLedger, collectChangedElementIds } from "../transaction";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, render, unmountComponent, waitFor } from "./test-utils";

import type { Transaction, TransactionSummary } from "../transaction";

const { h } = window;

const getElement = (id: string) =>
  h.app.scene.getNonDeletedElementsMap().get(id) ?? null;

const applyElementUpdate = (
  id: string,
  updates: ElementUpdate<OrderedExcalidrawElement>,
  captureUpdate: keyof typeof CaptureUpdateAction,
) => {
  const nextElements = h.app.scene
    .getElementsIncludingDeleted()
    .map((element) =>
      element.id === id ? newElementWith(element, updates) : element,
    );

  API.updateScene({
    elements: nextElements,
    captureUpdate: CaptureUpdateAction[captureUpdate],
  });
};

const setSceneBaseline = (elements: readonly ExcalidrawElement[]) => {
  API.updateScene({
    elements,
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

const commitTransaction = (tx: Transaction) => {
  let summary!: TransactionSummary;
  act(() => {
    summary = tx.commit();
  });
  return summary;
};

const setupCreateTransactionSuite = async () => {
  unmountComponent();
  vi.restoreAllMocks();
  await render(<Excalidraw handleKeyboardGlobally={true} />);
};

// ---------------------------------------------------------------------------
// TransactionLedger (unit tests — no React render needed)
// ---------------------------------------------------------------------------

describe("TransactionLedger", () => {
  it("ignores metadata-only changes when collecting changed ids", () => {
    const before = API.createElement({
      type: "rectangle",
      id: "rect-1",
    });
    const after = {
      ...before,
      version: before.version + 1,
      versionNonce: before.versionNonce + 1,
      seed: before.seed + 1,
      updated: before.updated + 1,
      index: "a2" as ExcalidrawElement["index"],
    };

    expect(
      collectChangedElementIds(arrayToMap([before]), arrayToMap([after])),
    ).toEqual([]);
  });

  it("drops ledger entry when element is created and deleted in one transaction", () => {
    const ledger = new TransactionLedger();
    const created = API.createElement({
      type: "rectangle",
      id: "rect-1",
    });

    ledger.recordStep(new Map(), arrayToMap([created]));
    expect(ledger.hasEntries()).toBe(true);

    ledger.recordStep(arrayToMap([created]), new Map());
    expect(ledger.hasEntries()).toBe(false);
  });

  it("materializes create operation when live scene still matches target", () => {
    const ledger = new TransactionLedger();
    const created = API.createElement({
      type: "rectangle",
      id: "rect-1",
      strokeColor: "#ff006e",
    });

    ledger.recordStep(new Map(), arrayToMap([created]));

    const { elementsBefore, elementsAfter } = ledger.buildSyntheticSnapshots(
      arrayToMap([created]),
    );

    expect(elementsBefore.has(created.id)).toBe(false);
    expect(elementsAfter.get(created.id)?.strokeColor).toBe("#ff006e");
  });

  it("skips conflicting touched-prop updates and keeps live values", () => {
    const ledger = new TransactionLedger();
    const baseline = API.createElement({
      type: "rectangle",
      id: "rect-1",
      strokeColor: "#000000",
    });
    const target = {
      ...baseline,
      strokeColor: "#ff006e",
      version: baseline.version + 1,
    };
    const live = {
      ...target,
      strokeColor: "#3a86ff",
      version: target.version + 1,
    };

    ledger.recordStep(arrayToMap([baseline]), arrayToMap([target]));

    const { elementsBefore, elementsAfter } = ledger.buildSyntheticSnapshots(
      arrayToMap([live]),
    );
    expect(elementsBefore.get(live.id)?.strokeColor).toBe("#3a86ff");
    expect(elementsAfter.get(live.id)?.strokeColor).toBe("#3a86ff");
  });
});

// ---------------------------------------------------------------------------
// createTransaction (integration tests — requires full Excalidraw render)
// ---------------------------------------------------------------------------

describe("createTransaction lifecycle", () => {
  beforeEach(setupCreateTransactionSuite);

  it("commits a single undo entry after tx.updateScene() calls", async () => {
    const element = API.createElement({
      type: "rectangle",
      id: "rect-1",
    });
    setSceneBaseline([element]);

    const commitSpy = vi
      .spyOn(h.store, "commitSyntheticIncrement")
      .mockReturnValue(true);

    const tx = h.app.createTransaction();

    act(() => {
      tx.updateScene({
        elements: h.app.scene
          .getElementsIncludingDeleted()
          .map((el) =>
            el.id === element.id
              ? newElementWith(el, { strokeColor: "#ff006e" })
              : el,
          ),
      });
    });

    const summary = commitTransaction(tx);

    expect(summary.status).toBe("committed");
    expect(summary.historyCommitted).toBe(true);
    expect(commitSpy).toHaveBeenCalledTimes(1);
  });

  it("cancel() does not commit history", () => {
    const commitSpy = vi.spyOn(h.store, "commitSyntheticIncrement");
    const tx = h.app.createTransaction();

    const summary = tx.cancel();

    expect(summary.status).toBe("canceled");
    expect(summary.historyCommitted).toBe(false);
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it("commit() is idempotent and skips empty transactions", () => {
    const commitSpy = vi.spyOn(h.store, "commitSyntheticIncrement");
    const tx = h.app.createTransaction();

    const first = tx.commit();
    const second = tx.commit();

    expect(second).toBe(first);
    expect(first.status).toBe("committed");
    expect(first.historyCommitted).toBe(false);
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it("throws on updateScene after commit", () => {
    const tx = h.app.createTransaction();
    commitTransaction(tx);

    expect(() => tx.updateScene({ elements: [] })).toThrow(/already committed/);
  });

  it("throws on updateScene after cancel", () => {
    const tx = h.app.createTransaction();
    tx.cancel();

    expect(() => tx.updateScene({ elements: [] })).toThrow(/already canceled/);
  });

  it("throws on updateElements after commit", () => {
    const tx = h.app.createTransaction();
    commitTransaction(tx);

    expect(() =>
      tx.updateElements({ elements: [{ id: "missing", x: 10 }] }),
    ).toThrow(/already committed/);
  });

  it("throws on updateElements after cancel", () => {
    const tx = h.app.createTransaction();
    tx.cancel();

    expect(() =>
      tx.updateElements({ elements: [{ id: "missing", x: 10 }] }),
    ).toThrow(/already canceled/);
  });
});

describe("createTransaction updateElements", () => {
  beforeEach(setupCreateTransactionSuite);

  it("supports partial element patches via tx.updateElements()", async () => {
    const elementA = API.createElement({
      type: "rectangle",
      id: "patch-a",
      x: 0,
      y: 0,
      strokeColor: "#000",
      backgroundColor: "#fff",
    });
    const elementB = API.createElement({
      type: "rectangle",
      id: "patch-b",
      x: 300,
      y: 100,
      strokeColor: "#222",
      backgroundColor: "#eee",
    });
    setSceneBaseline([elementA, elementB]);

    const tx = h.app.createTransaction();

    act(() => {
      tx.updateElements({
        elements: [
          { id: elementA.id, strokeColor: "#f00" },
          { id: elementB.id, x: 420, y: 180 },
        ],
      });
    });

    const summary = commitTransaction(tx);
    expect(summary.historyCommitted).toBe(true);
    expect(API.getUndoStack().length).toBe(1);

    let liveA = getElement(elementA.id)!;
    let liveB = getElement(elementB.id)!;
    expect(liveA.strokeColor).toBe("#f00");
    expect(liveA.backgroundColor).toBe(elementA.backgroundColor);
    expect(liveA.x).toBe(elementA.x);
    expect(liveB.x).toBe(420);
    expect(liveB.y).toBe(180);
    expect(liveB.strokeColor).toBe(elementB.strokeColor);

    Keyboard.undo();
    await waitFor(() => {
      liveA = getElement(elementA.id)!;
      liveB = getElement(elementB.id)!;
      expect(liveA.strokeColor).toBe(elementA.strokeColor);
      expect(liveA.backgroundColor).toBe(elementA.backgroundColor);
      expect(liveA.x).toBe(elementA.x);
      expect(liveB.x).toBe(elementB.x);
      expect(liveB.y).toBe(elementB.y);
      expect(liveB.strokeColor).toBe(elementB.strokeColor);
    });
  });

  it("treats updateElements() with unknown ids as a no-op", () => {
    const element = API.createElement({
      type: "rectangle",
      id: "known",
      x: 0,
      y: 0,
      strokeColor: "#000",
    });
    setSceneBaseline([element]);
    expect(API.getUndoStack().length).toBe(0);

    const tx = h.app.createTransaction();
    act(() => {
      tx.updateElements({
        elements: [{ id: "missing-element-id", x: 999, strokeColor: "#f00" }],
      });
    });

    const summary = commitTransaction(tx);
    expect(summary.historyCommitted).toBe(false);
    expect(API.getUndoStack().length).toBe(0);

    const live = getElement(element.id)!;
    expect(live.x).toBe(element.x);
    expect(live.y).toBe(element.y);
    expect(live.strokeColor).toBe(element.strokeColor);
  });
});

describe("createTransaction appState", () => {
  beforeEach(setupCreateTransactionSuite);

  it("forwards appState intent to commitSyntheticIncrement", async () => {
    const element = API.createElement({
      type: "rectangle",
      id: "rect-1",
    });
    setSceneBaseline([element]);

    const commitSpy = vi
      .spyOn(h.store, "commitSyntheticIncrement")
      .mockReturnValue(true);

    const tx = h.app.createTransaction();

    act(() => {
      tx.updateScene({
        elements: h.app.scene
          .getElementsIncludingDeleted()
          .map((el) =>
            el.id === element.id
              ? newElementWith(el, { backgroundColor: "#ffbe0b" })
              : el,
          ),
        appState: { selectedElementIds: { [element.id]: true } },
      });
    });

    tx.commit();

    expect(commitSpy).toHaveBeenCalledTimes(1);
    const call = commitSpy.mock.calls[0]![0];
    expect(call.logicalAfter.appState).toBeDefined();
    expect(call.logicalAfter.appState?.selectedElementIds).toEqual({
      [element.id]: true,
    });
  });

  it("uses resolveAppState output instead of accumulated appState intent", () => {
    const element = API.createElement({
      type: "rectangle",
      id: "resolver-source",
    });
    setSceneBaseline([element]);

    const commitSpy = vi
      .spyOn(h.store, "commitSyntheticIncrement")
      .mockReturnValue(true);

    const tx = h.app.createTransaction();
    act(() => {
      tx.updateScene({
        appState: { selectedElementIds: { [element.id]: true } },
      });
    });

    const resolverTargetId = "resolver-target";
    let summary!: TransactionSummary;
    act(() => {
      summary = tx.commit({
        resolveAppState: ({ initial, accumulated, live }) => {
          expect(initial.selectedElementIds).toEqual({});
          expect(accumulated.selectedElementIds).toEqual({
            [element.id]: true,
          });
          expect(live.selectedElementIds).toEqual({
            [element.id]: true,
          });
          return { selectedElementIds: { [resolverTargetId]: true } };
        },
      });
    });

    expect(summary.historyCommitted).toBe(true);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    const call = commitSpy.mock.calls[0]![0];
    expect(call.logicalAfter.appState?.selectedElementIds).toEqual({
      [resolverTargetId]: true,
    });
  });

  it("allows resolveAppState to suppress appState-only synthetic history", () => {
    const element = API.createElement({
      type: "rectangle",
      id: "resolver-suppress",
    });
    setSceneBaseline([element]);

    const commitSpy = vi.spyOn(h.store, "commitSyntheticIncrement");

    const tx = h.app.createTransaction();
    act(() => {
      tx.updateScene({
        appState: { selectedElementIds: { [element.id]: true } },
      });
    });

    let summary!: TransactionSummary;
    act(() => {
      summary = tx.commit({
        resolveAppState: () => undefined,
      });
    });

    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(summary.historyCommitted).toBe(false);
    expect(API.getUndoStack().length).toBe(0);
  });

  it("supports appState-only commit via tx.updateElements()", () => {
    const element = API.createElement({
      type: "rectangle",
      id: "appstate-only",
    });
    setSceneBaseline([element]);

    const commitSpy = vi
      .spyOn(h.store, "commitSyntheticIncrement")
      .mockReturnValue(true);

    const tx = h.app.createTransaction();
    act(() => {
      tx.updateElements({
        elements: [],
        appState: { selectedElementIds: { [element.id]: true } },
      });
    });

    const summary = commitTransaction(tx);
    expect(summary.historyCommitted).toBe(true);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    const call = commitSpy.mock.calls[0]![0];
    expect(call.logicalAfter.appState?.selectedElementIds).toEqual({
      [element.id]: true,
    });
  });
});

describe("createTransaction interleaving and undo ordering", () => {
  beforeEach(setupCreateTransactionSuite);

  it("keeps interleaved user edits and transaction history entries separated", async () => {
    const transactionElement = API.createElement({
      type: "rectangle",
      id: "tx-rect",
      x: 0,
      y: 0,
      strokeColor: "#1e1e1e",
      opacity: 100,
    });
    const userElement = API.createElement({
      type: "rectangle",
      id: "user-rect",
      x: 300,
      y: 0,
      backgroundColor: "#ffe8cc",
    });

    setSceneBaseline([transactionElement, userElement]);
    expect(API.getUndoStack().length).toBe(0);

    const tx = h.app.createTransaction();

    // First tx mutation
    act(() => {
      tx.updateScene({
        elements: h.app.scene.getElementsIncludingDeleted().map((el) =>
          el.id === transactionElement.id
            ? newElementWith(el, {
                x: 180,
                strokeColor: "#ff006e",
              })
            : el,
        ),
      });
    });

    // User edit interleaved
    applyElementUpdate(
      userElement.id,
      { backgroundColor: "#00f5d4" },
      "IMMEDIATELY",
    );

    // Second tx mutation
    act(() => {
      tx.updateScene({
        elements: h.app.scene
          .getElementsIncludingDeleted()
          .map((el) =>
            el.id === transactionElement.id
              ? newElementWith(el, { opacity: 60 })
              : el,
          ),
      });
    });

    // Another user edit
    applyElementUpdate(userElement.id, { y: 220 }, "IMMEDIATELY");

    expect(API.getUndoStack().length).toBe(2);
    const summary = commitTransaction(tx);
    expect(summary.historyCommitted).toBe(true);

    await waitFor(() => {
      expect(API.getUndoStack().length).toBe(3);
    });

    let liveTxElement = getElement(transactionElement.id)!;
    let liveUserElement = getElement(userElement.id)!;
    expect(liveTxElement.x).toBe(180);
    expect(liveTxElement.strokeColor).toBe("#ff006e");
    expect(liveTxElement.opacity).toBe(60);
    expect(liveUserElement.backgroundColor).toBe("#00f5d4");
    expect(liveUserElement.y).toBe(220);

    // Undo transaction entry
    Keyboard.undo();
    await waitFor(() => {
      liveTxElement = getElement(transactionElement.id)!;
      expect(liveTxElement.x).toBe(transactionElement.x);
      expect(liveTxElement.strokeColor).toBe(transactionElement.strokeColor);
      expect(liveTxElement.opacity).toBe(transactionElement.opacity);
    });
    liveUserElement = getElement(userElement.id)!;
    expect(liveUserElement.backgroundColor).toBe("#00f5d4");
    expect(liveUserElement.y).toBe(220);

    // Undo user edit
    Keyboard.undo();
    await waitFor(() => {
      liveUserElement = getElement(userElement.id)!;
      expect(liveUserElement.y).toBe(userElement.y);
      expect(liveUserElement.backgroundColor).toBe("#00f5d4");
    });

    // Undo another user edit
    Keyboard.undo();
    await waitFor(() => {
      liveUserElement = getElement(userElement.id)!;
      expect(liveUserElement.backgroundColor).toBe(userElement.backgroundColor);
      expect(liveUserElement.y).toBe(userElement.y);
    });
  });

  it("undoes transaction-created elements without rolling back user history", async () => {
    const base = API.createElement({
      type: "rectangle",
      id: "base",
      x: 0,
      y: 0,
    });
    const txCreated = API.createElement({
      type: "ellipse",
      id: "tx-created",
      x: 420,
      y: 100,
      backgroundColor: "#b197fc",
    });

    setSceneBaseline([base]);
    expect(getElement(txCreated.id)).toBeNull();

    const tx = h.app.createTransaction();

    act(() => {
      tx.updateScene({
        elements: [...h.app.scene.getElementsIncludingDeleted(), txCreated],
      });
    });

    applyElementUpdate(base.id, { x: 120 }, "IMMEDIATELY");
    expect(API.getUndoStack().length).toBe(1);

    const summary = commitTransaction(tx);
    expect(summary.historyCommitted).toBe(true);

    await waitFor(() => {
      expect(API.getUndoStack().length).toBe(2);
    });
    expect(getElement(txCreated.id)).not.toBeNull();

    Keyboard.undo();
    await waitFor(() => {
      expect(getElement(txCreated.id)).toBeNull();
      expect(getElement(base.id)?.x).toBe(120);
    });

    Keyboard.undo();
    await waitFor(() => {
      expect(getElement(base.id)?.x).toBe(base.x);
    });
  });

  it("keeps same-element user edits separated from transaction rollback", async () => {
    const element = API.createElement({
      type: "rectangle",
      id: "shared",
      x: 0,
      y: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "#ffe8cc",
    });

    setSceneBaseline([element]);
    expect(API.getUndoStack().length).toBe(0);

    const tx = h.app.createTransaction();

    act(() => {
      tx.updateScene({
        elements: h.app.scene.getElementsIncludingDeleted().map((el) =>
          el.id === element.id
            ? newElementWith(el, {
                strokeColor: "#ff006e",
                x: 200,
              })
            : el,
        ),
      });
    });

    applyElementUpdate(
      element.id,
      { backgroundColor: "#00f5d4" },
      "IMMEDIATELY",
    );

    const summary = commitTransaction(tx);
    expect(summary.historyCommitted).toBe(true);

    await waitFor(() => {
      expect(API.getUndoStack().length).toBe(2);
    });

    let live = getElement(element.id)!;
    expect(live.strokeColor).toBe("#ff006e");
    expect(live.x).toBe(200);
    expect(live.backgroundColor).toBe("#00f5d4");

    // Undo transaction
    Keyboard.undo();
    await waitFor(() => {
      live = getElement(element.id)!;
      expect(live.strokeColor).toBe(element.strokeColor);
      expect(live.x).toBe(element.x);
      expect(live.backgroundColor).toBe("#00f5d4");
    });

    // Undo user edit
    Keyboard.undo();
    await waitFor(() => {
      live = getElement(element.id)!;
      expect(live.backgroundColor).toBe(element.backgroundColor);
      expect(live.strokeColor).toBe(element.strokeColor);
      expect(live.x).toBe(element.x);
    });
  });

  it("transaction commit time not affected by tx creation time", async () => {
    const element = API.createElement({
      type: "rectangle",
      id: "shared",
      strokeColor: "#000",
    });
    setSceneBaseline([element]);

    const tx = h.app.createTransaction();

    applyElementUpdate(element.id, { strokeColor: "#f0f" }, "IMMEDIATELY");
    expect(getElement(element.id)!.strokeColor).toBe("#f0f");

    act(() => {
      tx.updateScene({
        elements: h.app.scene.getElementsIncludingDeleted().map((el) =>
          el.id === element.id
            ? newElementWith(el, {
                strokeColor: "#f00",
              })
            : el,
        ),
      });
    });

    commitTransaction(tx);
    expect(getElement(element.id)!.strokeColor).toBe("#f00");

    Keyboard.undo();
    expect(getElement(element.id)!.strokeColor).toBe("#f0f");

    Keyboard.undo();
    expect(getElement(element.id)!.strokeColor).toBe(element.strokeColor);
  });
});

describe("createTransaction live-wins-per-prop behavior", () => {
  beforeEach(setupCreateTransactionSuite);

  const setupSamePropertyConflictScenario = () => {
    const element = API.createElement({
      type: "rectangle",
      id: "shared",
      x: 0,
      y: 0,
      strokeColor: "#000",
      backgroundColor: "#fff",
    });
    setSceneBaseline([element]);
    expect(API.getUndoStack().length).toBe(0);

    const tx = h.app.createTransaction();

    act(() => {
      tx.updateScene({
        elements: h.app.scene.getElementsIncludingDeleted().map((el) =>
          el.id === element.id
            ? newElementWith(el, {
                strokeColor: "#f00",
                x: 200,
              })
            : el,
        ),
      });
    });

    // conflicting regular edit
    applyElementUpdate(element.id, { strokeColor: "#f0f" }, "IMMEDIATELY");

    commitTransaction(tx);
    expect(API.getUndoStack().length).toBe(2);

    return element;
  };

  it("tx merge strategy for conflicting edits should prefer live values", () => {
    const element = setupSamePropertyConflictScenario();

    const live = getElement(element.id)!;
    expect(live.strokeColor).toBe("#f0f");
    expect(live.x).toBe(200);
    expect(live.backgroundColor).toBe("#fff");
  });

  it("undoing transaction should keep conflicting live value while rolling back tx-only props", () => {
    const element = setupSamePropertyConflictScenario();

    Keyboard.undo();

    const live = getElement(element.id)!;
    // strokeColor is unchanged because the transaction itself didn't end up
    // touching it (it kept the current live value)
    expect(live.strokeColor).toBe("#f0f");
    // x should be reverted to pre-transaction value
    expect(live.x).toBe(0);
    expect(live.backgroundColor).toBe("#fff");
  });

  it("undoing regular edit after tx rollback restores pre-edit live value", () => {
    const element = setupSamePropertyConflictScenario();

    Keyboard.undo();
    Keyboard.undo();

    const live = getElement(element.id)!;
    expect(live.strokeColor).toBe("#f00");
    expect(live.x).toBe(0);
    expect(live.backgroundColor).toBe("#fff");
  });
});
