import React from "react";

import { arrayToMap } from "@excalidraw/common";
import { CaptureUpdateAction, newElementWith } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import {
  TransactionLedger,
  DEFAULT_TRANSACTION_MERGE_POLICY,
  collectChangedElementIds,
} from "../transaction";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, render, unmountComponent, waitFor } from "./test-utils";

import type { Transaction, TransactionSummary } from "../transaction";

const { h } = window;

const getElement = (id: string) =>
  h.app.scene.getNonDeletedElementsMap().get(id) ?? null;

const applyElementUpdate = (
  id: string,
  updates: Partial<ExcalidrawElement>,
  captureUpdate: keyof typeof CaptureUpdateAction,
) => {
  const nextElements = h.app.scene
    .getElementsIncludingDeleted()
    .map((element) =>
      element.id === id
        ? (newElementWith(element as any, updates as any) as ExcalidrawElement)
        : element,
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
      DEFAULT_TRANSACTION_MERGE_POLICY,
    );

    expect(elementsBefore.has(created.id)).toBe(false);
    expect(elementsAfter.get(created.id)?.strokeColor).toBe("#ff006e");
  });

  it("skips conflicting update when policy is live-wins", () => {
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
      DEFAULT_TRANSACTION_MERGE_POLICY,
    );

    expect(elementsBefore.get(live.id)?.strokeColor).toBe("#3a86ff");
    expect(elementsAfter.get(live.id)?.strokeColor).toBe("#3a86ff");
  });

  it("applies conflicting update when policy is transaction-wins", () => {
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
      {
        ...DEFAULT_TRANSACTION_MERGE_POLICY,
        conflictWinner: "transaction",
      },
    );

    expect(elementsBefore.get(live.id)?.strokeColor).toBe("#000000");
    expect(elementsAfter.get(live.id)?.strokeColor).toBe("#ff006e");
  });

  it("applies per-prop conflict handling and supports element-scope skip", () => {
    const ledger = new TransactionLedger();
    const baseline = API.createElement({
      type: "rectangle",
      id: "rect-1",
      strokeColor: "#000000",
      backgroundColor: "#ffffff",
    });
    const target = {
      ...baseline,
      strokeColor: "#ff006e",
      backgroundColor: "#ffd8a8",
      version: baseline.version + 1,
    };
    const live = {
      ...target,
      strokeColor: "#3a86ff",
      backgroundColor: "#ffd8a8",
      version: target.version + 1,
    };

    ledger.recordStep(arrayToMap([baseline]), arrayToMap([target]));

    const propScope = ledger.buildSyntheticSnapshots(
      arrayToMap([live]),
      DEFAULT_TRANSACTION_MERGE_POLICY,
    );
    expect(propScope.elementsBefore.get(live.id)?.strokeColor).toBe("#3a86ff");
    expect(propScope.elementsAfter.get(live.id)?.strokeColor).toBe("#3a86ff");
    expect(propScope.elementsBefore.get(live.id)?.backgroundColor).toBe(
      "#ffffff",
    );
    expect(propScope.elementsAfter.get(live.id)?.backgroundColor).toBe(
      "#ffd8a8",
    );

    const elementScope = ledger.buildSyntheticSnapshots(arrayToMap([live]), {
      ...DEFAULT_TRANSACTION_MERGE_POLICY,
      conflictScope: "element",
    });
    expect(elementScope.elementsBefore.get(live.id)?.strokeColor).toBe(
      "#3a86ff",
    );
    expect(elementScope.elementsAfter.get(live.id)?.strokeColor).toBe(
      "#3a86ff",
    );
    expect(elementScope.elementsBefore.get(live.id)?.backgroundColor).toBe(
      "#ffd8a8",
    );
    expect(elementScope.elementsAfter.get(live.id)?.backgroundColor).toBe(
      "#ffd8a8",
    );
  });
});

// ---------------------------------------------------------------------------
// createTransaction (integration tests — requires full Excalidraw render)
// ---------------------------------------------------------------------------

describe("createTransaction", () => {
  beforeEach(async () => {
    unmountComponent();
    vi.restoreAllMocks();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

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

    tx.updateScene({
      elements: h.app.scene
        .getElementsIncludingDeleted()
        .map((el) =>
          el.id === element.id
            ? newElementWith(el as any, { strokeColor: "#ff006e" } as any)
            : el,
        ),
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
    tx.commit();

    expect(() => tx.updateScene({ elements: [] })).toThrow(/already committed/);
  });

  it("throws on updateScene after cancel", () => {
    const tx = h.app.createTransaction();
    tx.cancel();

    expect(() => tx.updateScene({ elements: [] })).toThrow(/already canceled/);
  });

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

    tx.updateScene({
      elements: h.app.scene
        .getElementsIncludingDeleted()
        .map((el) =>
          el.id === element.id
            ? newElementWith(el as any, { backgroundColor: "#ffbe0b" } as any)
            : el,
        ),
      appState: { selectedElementIds: { [element.id]: true } },
    });

    act(() => {
      tx.commit();
    });

    expect(commitSpy).toHaveBeenCalledTimes(1);
    const call = commitSpy.mock.calls[0]![0];
    expect(call.logicalAfter.appState).toBeDefined();
    expect((call.logicalAfter.appState as any).selectedElementIds).toEqual({
      [element.id]: true,
    });
  });

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
    tx.updateScene({
      elements: h.app.scene.getElementsIncludingDeleted().map((el) =>
        el.id === transactionElement.id
          ? newElementWith(
              el as any,
              {
                x: 180,
                strokeColor: "#ff006e",
              } as any,
            )
          : el,
      ),
    });

    // User edit interleaved
    applyElementUpdate(
      userElement.id,
      { backgroundColor: "#00f5d4" },
      "IMMEDIATELY",
    );

    // Second tx mutation
    tx.updateScene({
      elements: h.app.scene
        .getElementsIncludingDeleted()
        .map((el) =>
          el.id === transactionElement.id
            ? newElementWith(el as any, { opacity: 60 } as any)
            : el,
        ),
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
    act(() => {
      Keyboard.undo();
    });
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
    act(() => {
      Keyboard.undo();
    });
    await waitFor(() => {
      liveUserElement = getElement(userElement.id)!;
      expect(liveUserElement.y).toBe(userElement.y);
      expect(liveUserElement.backgroundColor).toBe("#00f5d4");
    });

    // Undo another user edit
    act(() => {
      Keyboard.undo();
    });
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

    tx.updateScene({
      elements: [...h.app.scene.getElementsIncludingDeleted(), txCreated],
    });

    applyElementUpdate(base.id, { x: 120 }, "IMMEDIATELY");
    expect(API.getUndoStack().length).toBe(1);

    const summary = commitTransaction(tx);
    expect(summary.historyCommitted).toBe(true);

    await waitFor(() => {
      expect(API.getUndoStack().length).toBe(2);
    });
    expect(getElement(txCreated.id)).not.toBeNull();

    act(() => {
      Keyboard.undo();
    });
    await waitFor(() => {
      expect(getElement(txCreated.id)).toBeNull();
      expect(getElement(base.id)?.x).toBe(120);
    });

    act(() => {
      Keyboard.undo();
    });
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

    tx.updateScene({
      elements: h.app.scene.getElementsIncludingDeleted().map((el) =>
        el.id === element.id
          ? newElementWith(
              el as any,
              {
                strokeColor: "#ff006e",
                x: 200,
              } as any,
            )
          : el,
      ),
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
    act(() => {
      Keyboard.undo();
    });
    await waitFor(() => {
      live = getElement(element.id)!;
      expect(live.strokeColor).toBe(element.strokeColor);
      expect(live.x).toBe(element.x);
      expect(live.backgroundColor).toBe("#00f5d4");
    });

    // Undo user edit
    act(() => {
      Keyboard.undo();
    });
    await waitFor(() => {
      live = getElement(element.id)!;
      expect(live.backgroundColor).toBe(element.backgroundColor);
      expect(live.strokeColor).toBe(element.strokeColor);
      expect(live.x).toBe(element.x);
    });
  });
});
