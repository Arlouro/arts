import { describe, it, expect } from 'vitest';
import {
  decodeDetections,
  nonMaxSuppression,
  intersectionOverUnion,
  letterboxMeta,
  type Detection,
} from './yoloDetector';
import { IouTracker } from './tracker';
import {
  FramingController,
  DWELL_SECONDS,
  START_DELAY,
  type TrackingUpdate,
} from './framingController';

const box = (x1: number, y1: number, x2: number, y2: number, conf = 0.9): Detection =>
  ({ x1, y1, x2, y2, conf });

describe('yoloDetector math', () => {
  it('computes IoU correctly', () => {
    expect(intersectionOverUnion(box(0, 0, 10, 10), box(0, 0, 10, 10))).toBeCloseTo(1);
    expect(intersectionOverUnion(box(0, 0, 10, 10), box(20, 20, 30, 30))).toBe(0);
    expect(intersectionOverUnion(box(0, 0, 10, 10), box(5, 0, 15, 10))).toBeCloseTo(50 / 150);
  });

  it('NMS keeps highest-confidence overlapping box', () => {
    const kept = nonMaxSuppression([box(0, 0, 10, 10, 0.8), box(1, 1, 11, 11, 0.95)], 0.5);
    expect(kept).toHaveLength(1);
    expect(kept[0].conf).toBe(0.95);
  });

  it('NMS keeps non-overlapping boxes', () => {
    const kept = nonMaxSuppression([box(0, 0, 10, 10), box(100, 100, 120, 130)], 0.5);
    expect(kept).toHaveLength(2);
  });

  it('decodes attrs-first layout [1, 5, N] and un-letterboxes to source pixels', () => {
    const meta = letterboxMeta(640, 480);
    expect(meta.gain).toBeCloseTo(1);
    expect(meta.padY).toBeCloseTo(80);

    const numAnchors = 40;
    const data = new Float32Array(5 * numAnchors);
    data[0 * numAnchors + 2] = 320;
    data[1 * numAnchors + 2] = 320;
    data[2 * numAnchors + 2] = 100;
    data[3 * numAnchors + 2] = 60;
    data[4 * numAnchors + 2] = 0.92;

    const dets = decodeDetections(data, [1, 5, numAnchors], meta, 0.7);
    expect(dets).toHaveLength(1);
    expect(dets[0].x1).toBeCloseTo(270);
    expect(dets[0].y1).toBeCloseTo(210); // 320 - 30 - pad 80
    expect(dets[0].x2).toBeCloseTo(370);
    expect(dets[0].y2).toBeCloseTo(270);
  });

  it('decodes anchors-first layout [1, N, 5] identically', () => {
    const meta = letterboxMeta(640, 640);
    const numAnchors = 40;
    const data = new Float32Array(numAnchors * 5);
    data[1 * 5 + 0] = 100;
    data[1 * 5 + 1] = 200;
    data[1 * 5 + 2] = 40;
    data[1 * 5 + 3] = 40;
    data[1 * 5 + 4] = 0.8;

    const dets = decodeDetections(data, [1, numAnchors, 5], meta, 0.7);
    expect(dets).toHaveLength(1);
    expect(dets[0].x1).toBeCloseTo(80);
    expect(dets[0].y2).toBeCloseTo(220);
  });
});

describe('IouTracker', () => {
  it('keeps the same id for an overlapping detection across frames', () => {
    const tracker = new IouTracker();
    const [t1] = tracker.update([box(100, 100, 200, 200)], 0);
    const [t2] = tracker.update([box(105, 102, 205, 203)], 0.2);
    expect(t2.id).toBe(t1.id);
  });

  it('assigns a new id to a distant detection', () => {
    const tracker = new IouTracker();
    const [t1] = tracker.update([box(0, 0, 50, 50)], 0);
    const [t2] = tracker.update([box(400, 400, 500, 500)], 0.2);
    expect(t2.id).not.toBe(t1.id);
  });

  it('expires stale tracks after maxAge', () => {
    const tracker = new IouTracker(0.3, 0.5);
    const [t1] = tracker.update([box(0, 0, 50, 50)], 0);
    tracker.update([], 1.0); // ages out
    const [t2] = tracker.update([box(0, 0, 50, 50)], 1.1);
    expect(t2.id).not.toBe(t1.id);
  });
});

describe('FramingController', () => {
  const FRAME_W = 640;
  const FRAME_H = 480;
  // Fully in-frame, centred box.
  const centredTrack = (id: number, conf = 0.95) => ({
    id,
    box: box(220, 160, 420, 320, conf),
    lastSeen: 0,
    velocity: [0, 0] as [number, number],
  });

  function run(controller: FramingController, tracks: ReturnType<typeof centredTrack>[], now: number) {
    const statuses: string[] = [];
    const tracking: TrackingUpdate[] = [];
    const captures: number[] = [];
    controller.process(tracks, FRAME_W, FRAME_H, now, {
      onStatus: s => statuses.push(s),
      onTracking: t => tracking.push(t),
      onCapture: id => captures.push(id),
    });
    return { statuses, tracking, captures };
  }

  it('emits focusing on first sight and captures after start delay + dwell', () => {
    const c = new FramingController();
    const first = run(c, [centredTrack(1)], 0);
    expect(first.statuses).toContain('focusing');
    expect(first.captures).toHaveLength(0);

    // After START_DELAY: candidate accepted, centered dwell begins
    const second = run(c, [centredTrack(1)], START_DELAY + 0.05);
    expect(second.statuses).toContain('centered');
    expect(second.tracking[0]?.inFrame).toBe(true);
    expect(second.captures).toHaveLength(0);

    // After dwell: capture fires exactly once
    const third = run(c, [centredTrack(1)], START_DELAY + 0.05 + DWELL_SECONDS + 0.05);
    expect(third.captures).toEqual([1]);

    // Saved id never re-captures
    const fourth = run(c, [centredTrack(1)], START_DELAY + 2 * DWELL_SECONDS + 1);
    expect(fourth.captures).toHaveLength(0);
  });

  it('reports the most violated edge when the painting is cut off', () => {
    const c = new FramingController();
    const track = { id: 7, box: box(-40, 160, 200, 320, 0.9), lastSeen: 0, velocity: [0, 0] as [number, number] };
    run(c, [track], 0);
    const result = run(c, [track], START_DELAY + 0.05);
    expect(result.statuses).toContain('out_of_frame_left');
    expect(result.tracking[0]?.inFrame).toBe(false);
    expect(result.captures).toHaveLength(0);
  });

  it('reports multiple violations when cut on 3+ edges', () => {
    const c = new FramingController();
    const track = { id: 9, box: box(-20, -20, 700, 500, 0.9), lastSeen: 0, velocity: [0, 0] as [number, number] };
    run(c, [track], 0);
    const result = run(c, [track], START_DELAY + 0.05);
    expect(result.statuses).toContain('out_of_frame_multiple');
  });

  it('prefers the centred candidate among several', () => {
    const c = new FramingController();
    const centred = centredTrack(1);
    const offCentre = { id: 2, box: box(60, 60, 160, 140, 0.99), lastSeen: 0, velocity: [0, 0] as [number, number] };
    run(c, [centred, offCentre], 0);
    const result = run(c, [centred, offCentre], START_DELAY + DWELL_SECONDS + 0.1);
    const final = run(c, [centred, offCentre], START_DELAY + 2 * (DWELL_SECONDS + 0.1));
    const captured = [...result.captures, ...final.captures];
    expect(captured).toContain(1);
    expect(captured).not.toContain(2);
  });
});
