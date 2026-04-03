import {
  pointDistance,
  vectorCross,
  vectorDot,
  vectorFromPoint,
} from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import { isPathALoop } from "./utils";

import type { ExcalidrawFreeDrawElement } from "./types";

type ZoomValue = NonNullable<Parameters<typeof isPathALoop>[1]>;

type FixedFreeDrawSimplificationProfile = {
  minPointDistancePx: number;
  maxPointDistance: number;
  strokeDistanceFactor: number;
  collinearityFactor: number;
  minAlignment: number;
  zoomScaling: "sqrt" | "none";
};

const FIXED_FREEDRAW_CAPTURE_PROFILE: FixedFreeDrawSimplificationProfile = {
  minPointDistancePx: 0.35,
  maxPointDistance: 0.85,
  strokeDistanceFactor: 0.08,
  collinearityFactor: 0.3,
  minAlignment: 0.985,
  zoomScaling: "sqrt",
};

const hasSyntheticLoopClosure = (
  points: readonly LocalPoint[],
): points is readonly [LocalPoint, LocalPoint, ...LocalPoint[]] => {
  if (points.length < 3) {
    return false;
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1];
};

const stripSyntheticLoopClosure = (points: readonly LocalPoint[]) =>
  hasSyntheticLoopClosure(points) ? points.slice(0, -1) : points;

export const isLoopFreeDrawElement = (
  element: ExcalidrawFreeDrawElement,
  zoomValue: ZoomValue = 1 as ZoomValue,
) => element.strokeShape !== "fixed" && isPathALoop(element.points, zoomValue);

export const getFixedFreeDrawPoints = (
  element: ExcalidrawFreeDrawElement,
): readonly LocalPoint[] => stripSyntheticLoopClosure(element.points);

export const getFixedFreeDrawPointSamplingDistance = (
  strokeWidth: number,
  zoomValue: ZoomValue = 1 as ZoomValue,
  profile: FixedFreeDrawSimplificationProfile = FIXED_FREEDRAW_CAPTURE_PROFILE,
) =>
  Math.min(
    Math.max(
      profile.minPointDistancePx /
        (profile.zoomScaling === "sqrt"
          ? Math.max(1, Math.sqrt(zoomValue))
          : 1),
      strokeWidth * profile.strokeDistanceFactor,
    ),
    profile.maxPointDistance,
  );

const isRedundantFixedFreeDrawPoint = (
  previousPoint: LocalPoint,
  currentPoint: LocalPoint,
  nextPoint: LocalPoint,
  strokeWidth: number,
  zoomValue: ZoomValue,
  profile: FixedFreeDrawSimplificationProfile,
) => {
  const previousSegmentLength = pointDistance(previousPoint, currentPoint);
  const nextSegmentLength = pointDistance(currentPoint, nextPoint);

  if (!previousSegmentLength || !nextSegmentLength) {
    return true;
  }

  const previousVector = vectorFromPoint(currentPoint, previousPoint);
  const nextVector = vectorFromPoint(nextPoint, currentPoint);
  const alignment =
    vectorDot(previousVector, nextVector) /
    (previousSegmentLength * nextSegmentLength);

  if (alignment < profile.minAlignment) {
    return false;
  }

  const chord = vectorFromPoint(nextPoint, previousPoint);
  const chordLength = pointDistance(previousPoint, nextPoint);

  if (!chordLength) {
    return true;
  }

  const distanceToChord =
    Math.abs(vectorCross(vectorFromPoint(currentPoint, previousPoint), chord)) /
    chordLength;

  return (
    distanceToChord <=
    getFixedFreeDrawPointSamplingDistance(strokeWidth, zoomValue, profile) *
      profile.collinearityFactor
  );
};

export const getFixedFreeDrawPointAction = ({
  points,
  nextPoint,
  strokeWidth,
  zoomValue,
  isFinalPoint = false,
  profile,
}: {
  points: readonly LocalPoint[];
  nextPoint: LocalPoint;
  strokeWidth: number;
  zoomValue: ZoomValue;
  isFinalPoint?: boolean;
  profile?: FixedFreeDrawSimplificationProfile;
}) => {
  const simplificationProfile = profile ?? FIXED_FREEDRAW_CAPTURE_PROFILE;
  const lastPoint = points[points.length - 1];

  if (!lastPoint) {
    return "append" as const;
  }

  if (lastPoint[0] === nextPoint[0] && lastPoint[1] === nextPoint[1]) {
    return "discard" as const;
  }

  const samplingDistance = getFixedFreeDrawPointSamplingDistance(
    strokeWidth,
    zoomValue,
    simplificationProfile,
  );

  if (points.length === 1) {
    return !isFinalPoint &&
      pointDistance(lastPoint, nextPoint) < samplingDistance
      ? ("discard" as const)
      : ("append" as const);
  }

  const previousPoint = points[points.length - 2];

  if (
    isRedundantFixedFreeDrawPoint(
      previousPoint,
      lastPoint,
      nextPoint,
      strokeWidth,
      zoomValue,
      simplificationProfile,
    )
  ) {
    return "replace" as const;
  }

  if (!isFinalPoint && pointDistance(lastPoint, nextPoint) < samplingDistance) {
    return "discard" as const;
  }

  return "append" as const;
};

export const getRenderableFixedFreeDrawPoints = (
  element: ExcalidrawFreeDrawElement,
): readonly LocalPoint[] => getFixedFreeDrawPoints(element);
