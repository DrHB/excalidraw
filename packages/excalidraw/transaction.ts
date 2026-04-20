import { randomId } from "@excalidraw/common";
import { CaptureUpdateAction, deepCopyElement } from "@excalidraw/element";

import type { Mutable } from "@excalidraw/common/utility-types";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
  SceneElementsMap,
} from "@excalidraw/element/types";

import type {
  AppClassProperties,
  AppState,
  ObservedAppState,
  SceneData,
} from "./types";

// ---------------------------------------------------------------------------
// Ledger types
// ---------------------------------------------------------------------------

/**
 * Which side wins when transaction output and live scene diverge.
 *
 * - "live": keep what users currently see in the canvas for conflicting changes.
 * - "transaction": force transaction changes for conflicting changes.
 */
export type ConflictWinner = "live" | "transaction";

/**
 * Conflict granularity used by the merge policy.
 *
 * - "prop": resolve each touched property independently.
 * - "element": when any touched property conflicts, resolve at whole-element level.
 */
export type ConflictScope = "prop" | "element";

/**
 * Merge policy used when building synthetic before/after snapshots.
 *
 * Four meaningful combinations are supported:
 * - live + prop: keep live only for conflicting props, still apply non-conflicting tx props.
 * - live + element: if any touched prop conflicts, skip the whole element update.
 * - transaction + prop: force tx values for conflicting props, keep untouched live props.
 * - transaction + element: if any touched prop conflicts, force the whole tx element.
 */
export type TransactionMergePolicy = {
  conflictWinner: ConflictWinner;
  conflictScope: ConflictScope;
};

/**
 * Named merge presets for clearer call-sites.
 *
 * These names are intentionally explicit to avoid ambiguity around
 * winner/scope semantics.
 */
export type TransactionMergeMode =
  | "live-wins-per-prop"
  | "live-wins-per-element"
  | "transaction-wins-per-prop"
  | "transaction-wins-per-element";

export const DEFAULT_TRANSACTION_MERGE_POLICY: TransactionMergePolicy = {
  conflictWinner: "live",
  conflictScope: "prop",
};

export const TRANSACTION_MERGE_MODES: Record<
  TransactionMergeMode,
  TransactionMergePolicy
> = {
  "live-wins-per-prop": {
    conflictWinner: "live",
    conflictScope: "prop",
  },
  "live-wins-per-element": {
    conflictWinner: "live",
    conflictScope: "element",
  },
  "transaction-wins-per-prop": {
    conflictWinner: "transaction",
    conflictScope: "prop",
  },
  "transaction-wins-per-element": {
    conflictWinner: "transaction",
    conflictScope: "element",
  },
};

/** Per-element ledger record captured during a transaction session. */
export type TransactionLedgerEntry = {
  baselineElement: ExcalidrawElement | null;
  targetElement: ExcalidrawElement | null;
  touchedProps: Set<string>;
};

// ---------------------------------------------------------------------------
// Ledger helpers
// ---------------------------------------------------------------------------

const LEDGER_IGNORED_PROPS = new Set([
  "version",
  "versionNonce",
  "seed",
  "updated",
  "index",
]);

type ElementRecord = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const getElementProp = (element: ExcalidrawElement, prop: string): unknown =>
  (element as ElementRecord)[prop];

const setOrderedElementProp = (
  element: Mutable<OrderedExcalidrawElement>,
  prop: string,
  value: unknown,
) => {
  (element as ElementRecord)[prop] = value;
};

/** Deep equality used by ledger conflict/touched-prop detection. */
const isLedgerValueEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!isLedgerValueEqual(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) {
        return false;
      }
      if (!isLedgerValueEqual(left[key], right[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
};

/** Shallow-copies a scene map. Entries share references with the original. */
const shallowCopySceneMap = (
  elements: ReadonlyMap<string, ExcalidrawElement>,
): SceneElementsMap => new Map(elements) as SceneElementsMap;

/** Returns changed property names between two element snapshots. */
const collectTouchedProps = (
  before: ExcalidrawElement | null,
  after: ExcalidrawElement | null,
) => {
  if (!before || !after) {
    return new Set<string>(["*"]);
  }

  const touchedProps = new Set<string>();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    if (LEDGER_IGNORED_PROPS.has(key)) {
      continue;
    }
    if (
      !isLedgerValueEqual(
        getElementProp(before, key),
        getElementProp(after, key),
      )
    ) {
      touchedProps.add(key);
    }
  }

  return touchedProps;
};

/** Returns ids whose element snapshot changed between two points in time. */
export const collectChangedElementIds = (
  before: ReadonlyMap<string, ExcalidrawElement>,
  after: ReadonlyMap<string, ExcalidrawElement>,
) => {
  const changedIds = new Set<string>();
  const candidateIds = new Set<string>([...before.keys(), ...after.keys()]);

  for (const id of candidateIds) {
    const beforeElement = before.get(id) ?? null;
    const afterElement = after.get(id) ?? null;
    if (collectTouchedProps(beforeElement, afterElement).size > 0) {
      changedIds.add(id);
    }
  }

  return [...changedIds];
};

/** Detects if an updated element has any live-vs-target conflict on touched props. */
const hasTouchedPropConflict = (
  entry: TransactionLedgerEntry,
  liveElement: ExcalidrawElement,
  targetElement: ExcalidrawElement,
) => {
  for (const prop of entry.touchedProps) {
    const liveValue = getElementProp(liveElement, prop);
    const targetValue = getElementProp(targetElement, prop);
    if (!isLedgerValueEqual(liveValue, targetValue)) {
      return true;
    }
  }
  return false;
};

export type TransactionCreateOptions =
  | {
      mergeMode?: TransactionMergeMode;
      mergePolicy?: never;
    }
  | {
      mergeMode?: never;
      mergePolicy?: Partial<TransactionMergePolicy>;
    };

const resolveTransactionMergePolicy = (
  options?: TransactionCreateOptions,
): TransactionMergePolicy => {
  if (!options) {
    return DEFAULT_TRANSACTION_MERGE_POLICY;
  }

  // Runtime guard for untyped callers.
  if ("mergeMode" in options && "mergePolicy" in options) {
    if (options.mergeMode && options.mergePolicy) {
      throw new Error(
        "Transaction options are ambiguous: pass either mergeMode or mergePolicy, not both.",
      );
    }
  }

  if ("mergeMode" in options && options.mergeMode) {
    return TRANSACTION_MERGE_MODES[options.mergeMode];
  }

  const partialPolicy =
    "mergePolicy" in options ? options.mergePolicy : undefined;
  return {
    ...DEFAULT_TRANSACTION_MERGE_POLICY,
    ...partialPolicy,
  };
};

// ---------------------------------------------------------------------------
// TransactionLedger
// ---------------------------------------------------------------------------

/**
 * Keeps transaction-level scene mutations and materializes synthetic snapshots
 * for a single durable history commit.
 */
export class TransactionLedger {
  private readonly entries = new Map<string, TransactionLedgerEntry>();

  /** Whether the transaction has any net element mutations. */
  hasEntries() {
    return this.entries.size > 0;
  }

  /** Releases all ledger entries. */
  clear() {
    this.entries.clear();
  }

  /** Records one element mutation step into the ledger. */
  recordStep(
    before: ReadonlyMap<string, ExcalidrawElement>,
    after: ReadonlyMap<string, ExcalidrawElement>,
  ) {
    for (const elementId of collectChangedElementIds(before, after)) {
      const beforeElement = before.get(elementId) ?? null;
      const afterElement = after.get(elementId) ?? null;
      const touchedProps = collectTouchedProps(beforeElement, afterElement);

      if (touchedProps.size === 0) {
        continue;
      }

      const existing = this.entries.get(elementId);
      if (!existing) {
        this.entries.set(elementId, {
          baselineElement: beforeElement
            ? deepCopyElement(beforeElement)
            : null,
          targetElement: afterElement ? deepCopyElement(afterElement) : null,
          touchedProps,
        });
        continue;
      }

      existing.targetElement = afterElement
        ? deepCopyElement(afterElement)
        : null;
      if (existing.touchedProps.has("*") || touchedProps.has("*")) {
        existing.touchedProps = new Set(["*"]);
      } else {
        for (const prop of touchedProps) {
          existing.touchedProps.add(prop);
        }
      }

      // Created then deleted inside one transaction leaves no durable footprint.
      if (!existing.baselineElement && !existing.targetElement) {
        this.entries.delete(elementId);
        continue;
      }
      if (!existing.baselineElement && existing.targetElement?.isDeleted) {
        this.entries.delete(elementId);
      }
    }
  }

  /**
   * Builds synthetic element before/after snapshots by reconciling transaction
   * targets with current live scene state under the selected merge policy.
   */
  buildSyntheticSnapshots(
    live: ReadonlyMap<string, ExcalidrawElement>,
    mergePolicy: TransactionMergePolicy,
  ) {
    // Shallow copy — untouched elements stay as live references.
    // Only elements mutated in-place (prop-level updates) are deep-copied below.
    const elementsBefore = shallowCopySceneMap(live);
    const elementsAfter = shallowCopySceneMap(live);

    for (const [elementId, entry] of this.entries) {
      if (!entry.baselineElement) {
        const liveElement = live.get(elementId) ?? null;
        const targetElement = entry.targetElement;
        if (!targetElement) {
          continue;
        }
        if (
          mergePolicy.conflictWinner === "live" &&
          (!liveElement ||
            liveElement.isDeleted ||
            collectTouchedProps(targetElement, liveElement).size > 0)
        ) {
          continue;
        }
        elementsBefore.delete(elementId);
        elementsAfter.set(
          elementId,
          deepCopyElement(targetElement) as OrderedExcalidrawElement,
        );
        continue;
      }

      if (!entry.targetElement) {
        const liveElement = live.get(elementId) ?? null;
        if (
          mergePolicy.conflictWinner === "live" &&
          liveElement &&
          !liveElement.isDeleted
        ) {
          continue;
        }
        elementsBefore.set(
          elementId,
          deepCopyElement(entry.baselineElement) as OrderedExcalidrawElement,
        );
        elementsAfter.delete(elementId);
        continue;
      }

      const liveElement = live.get(elementId) ?? null;
      const targetElement = entry.targetElement;
      const baselineElement = entry.baselineElement;
      const beforeElement = elementsBefore.get(elementId);
      const afterElement = elementsAfter.get(elementId);

      if (
        !liveElement ||
        !baselineElement ||
        !targetElement ||
        !beforeElement ||
        !afterElement
      ) {
        continue;
      }

      if (entry.touchedProps.has("*")) {
        const hasLiveConflict =
          collectTouchedProps(targetElement, liveElement).size > 0;
        if (mergePolicy.conflictWinner === "live" && hasLiveConflict) {
          continue;
        }
        elementsBefore.set(
          elementId,
          deepCopyElement(baselineElement) as OrderedExcalidrawElement,
        );
        elementsAfter.set(
          elementId,
          deepCopyElement(targetElement) as OrderedExcalidrawElement,
        );
        continue;
      }

      const hasElementConflict = hasTouchedPropConflict(
        entry,
        liveElement,
        targetElement,
      );

      if (hasElementConflict && mergePolicy.conflictScope === "element") {
        if (mergePolicy.conflictWinner === "live") {
          // Example: user changed strokeColor while tx changed strokeColor+x.
          // "live + element" keeps the whole live element, including x.
          continue;
        }

        // Example: same conflict as above but "transaction + element".
        // This applies tx target for the whole element, including untouched props.
        elementsBefore.set(
          elementId,
          deepCopyElement(baselineElement) as OrderedExcalidrawElement,
        );
        elementsAfter.set(
          elementId,
          deepCopyElement(targetElement) as OrderedExcalidrawElement,
        );
        continue;
      }

      // Deep-copy before mutating so we never touch live elements.
      const clonedBefore = deepCopyElement(
        beforeElement,
      ) as Mutable<OrderedExcalidrawElement>;
      const clonedAfter = deepCopyElement(
        afterElement,
      ) as Mutable<OrderedExcalidrawElement>;
      elementsBefore.set(elementId, clonedBefore as OrderedExcalidrawElement);
      elementsAfter.set(elementId, clonedAfter as OrderedExcalidrawElement);

      const mutableBefore = clonedBefore;
      const mutableAfter = clonedAfter;

      let appliedProps = 0;
      for (const prop of entry.touchedProps) {
        const liveValue = getElementProp(liveElement, prop);
        const targetValue = getElementProp(targetElement, prop);
        const hasConflict = !isLedgerValueEqual(liveValue, targetValue);
        if (mergePolicy.conflictWinner === "live" && hasConflict) {
          continue;
        }

        setOrderedElementProp(
          mutableBefore,
          prop,
          getElementProp(baselineElement, prop),
        );
        setOrderedElementProp(mutableAfter, prop, targetValue);
        appliedProps += 1;
      }

      if (appliedProps > 0) {
        mutableBefore.version = baselineElement.version;
        mutableBefore.versionNonce = baselineElement.versionNonce;
        mutableAfter.version = targetElement.version;
        mutableAfter.versionNonce = targetElement.versionNonce;
      }
    }

    return { elementsBefore, elementsAfter };
  }
}

// ---------------------------------------------------------------------------
// Transaction types
// ---------------------------------------------------------------------------

/** Lifecycle state of a transaction. */
export type TransactionStatus = "active" | "committed" | "canceled";

/** Final summary returned when a transaction is committed or canceled. */
export type TransactionSummary = {
  id: string;
  status: TransactionStatus;
  historyCommitted: boolean;
};

/** Three-way appState context provided to the resolver at commit time. */
export type AppStateResolverContext = {
  /** AppState snapshot captured when the transaction was created. */
  initial: Partial<ObservedAppState>;
  /** Merged appState intent from all updateScene calls during the transaction. */
  accumulated: Partial<ObservedAppState>;
  /** Current live appState at commit time. */
  live: Partial<ObservedAppState>;
};

/**
 * Caller-provided resolver that determines which appState changes are
 * recorded in the history entry.
 *
 * Unlike elements — where per-property conflict detection works because
 * element properties are largely independent — appState keys are often
 * interdependent (e.g. selectedElementIds ↔ selectedGroupIds must stay
 * consistent). The correct merge strategy therefore depends on the
 * caller's semantic context, not on a generic policy.
 *
 * Return the appState delta to record in history, or undefined to skip
 * appState changes entirely.
 */
export type AppStateResolver = (
  context: AppStateResolverContext,
) => Partial<ObservedAppState> | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Shallow-copies the scene's elements map so that in-place mutations
 * (e.g. replaceAllElements clearing the map) don't affect our snapshot.
 *
 * Element references are shared — this is safe because:
 * - updateScene creates new element objects for changed properties
 * - syncInvalidIndices may mutate `index` in-place, but `index` is in
 *   LEDGER_IGNORED_PROPS so the ledger never considers it
 * - the ledger deep-copies only the elements it actually records
 */
const shallowSnapshotElements = (
  elementsMap: Map<string, ExcalidrawElement>,
): Map<string, ExcalidrawElement> => new Map(elementsMap);

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

/**
 * A transaction that records mutations via `updateScene(NEVER)` and commits
 * a single synthetic durable history entry at the end.
 */
export class Transaction {
  public readonly id = `tx-${randomId()}`;

  private readonly app: AppClassProperties;
  private readonly mergePolicy: TransactionMergePolicy;
  private readonly ledger = new TransactionLedger();
  private readonly initialAppState: Partial<ObservedAppState>;

  private accumulatedAppState: Record<string, unknown> = {};
  private statusValue: TransactionStatus = "active";
  private cachedSummary: TransactionSummary | null = null;

  constructor(
    app: AppClassProperties,
    options?: TransactionCreateOptions,
  ) {
    this.app = app;
    this.mergePolicy = resolveTransactionMergePolicy(options);
    this.initialAppState = { ...app.store.snapshot.appState };
  }

  get status(): TransactionStatus {
    return this.statusValue;
  }

  private assertActive(action: string): void {
    if (this.statusValue !== "active") {
      throw new Error(
        `Cannot ${action} — transaction ${this.id} is already ${this.statusValue}.`,
      );
    }
  }

  updateScene<K extends keyof AppState>(data: {
    elements?: SceneData["elements"];
    appState?: Pick<AppState, K> | null;
  }): void {
    this.assertActive("updateScene");

    // Snapshot before (shallow copy — replaceAllElements mutates the map in-place)
    const before = shallowSnapshotElements(
      this.app.scene.getElementsMapIncludingDeleted(),
    );

    // Apply through the real updateScene with NEVER.
    this.app.api.updateScene({
      elements: data.elements,
      appState: data.appState,
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    // Snapshot after
    const after = this.app.scene.getElementsMapIncludingDeleted();

    // Record element diff into ledger
    this.ledger.recordStep(before, after);

    // Accumulate appState intent
    if (data.appState) {
      this.accumulatedAppState = {
        ...this.accumulatedAppState,
        ...(data.appState as Record<string, unknown>),
      };
    }
  }

  commit(options?: {
    /**
     * Resolver that determines which appState changes are recorded in the
     * history entry.
     *
     * AppState keys are often interdependent (e.g. selectedElementIds ↔
     * selectedGroupIds) and the correct merge depends on the caller's
     * semantic context — a generic conflict policy cannot cover these cases.
     * The resolver receives all three states (initial, accumulated, live) so
     * the caller can make an informed decision.
     *
     * When omitted, the accumulated appState from updateScene calls is used
     * as-is — suitable when the caller has already ensured correctness at
     * each updateScene step.
     */
    resolveAppState?: AppStateResolver;
  }): TransactionSummary {
    if (this.cachedSummary) {
      return this.cachedSummary;
    }

    if (this.statusValue === "active") {
      this.statusValue = "committed";
    }

    let historyCommitted = false;

    const hasWork =
      this.ledger.hasEntries() ||
      Object.keys(this.accumulatedAppState).length > 0;

    if (this.statusValue === "committed" && hasWork) {
      const liveMap = this.app.scene.getElementsMapIncludingDeleted();
      const { elementsBefore, elementsAfter } =
        this.ledger.buildSyntheticSnapshots(liveMap, this.mergePolicy);

      // Resolve appState for the history entry.
      const hasAccumulatedAppState =
        Object.keys(this.accumulatedAppState).length > 0;

      let appStateDelta: Partial<ObservedAppState> | undefined;
      if (hasAccumulatedAppState) {
        if (options?.resolveAppState) {
          const context: AppStateResolverContext = {
            initial: this.initialAppState,
            accumulated: this.accumulatedAppState as Partial<ObservedAppState>,
            live: { ...this.app.store.snapshot.appState },
          };
          appStateDelta = options.resolveAppState(context);
        } else {
          appStateDelta = this.accumulatedAppState as Partial<ObservedAppState>;
        }
      }

      const hasAppStateChanges =
        !!appStateDelta && Object.keys(appStateDelta).length > 0;

      historyCommitted = this.app.store.commitSyntheticIncrement({
        logicalBefore: { elements: elementsBefore },
        logicalAfter: {
          elements: elementsAfter,
          appState: hasAppStateChanges ? appStateDelta : undefined,
        },
      });
    }

    this.cachedSummary = {
      id: this.id,
      status: this.statusValue,
      historyCommitted,
    };
    this.ledger.clear();
    return this.cachedSummary;
  }

  cancel(): TransactionSummary {
    if (this.cachedSummary) {
      return this.cachedSummary;
    }

    if (this.statusValue === "active") {
      this.statusValue = "canceled";
    }

    this.cachedSummary = {
      id: this.id,
      status: this.statusValue,
      historyCommitted: false,
    };
    this.ledger.clear();
    return this.cachedSummary;
  }
}

// ---------------------------------------------------------------------------
// TransactionManager
// ---------------------------------------------------------------------------

/**
 * Thin factory that holds the app reference and creates Transaction instances.
 */
export class TransactionManager {
  private readonly app: AppClassProperties;

  constructor(app: AppClassProperties) {
    this.app = app;
  }

  create(options?: TransactionCreateOptions): Transaction {
    return new Transaction(this.app, options);
  }
}
