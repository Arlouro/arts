import type { Track } from './tracker';

export const EMA_ALPHA = 0.4;
export const DWELL_SECONDS = 0.7;
export const CENTER_ZONE = 0.08;
export const BORDER_MARGIN = 0.06;
export const START_DELAY = 0.5;

export interface TrackingUpdate {
  dx: number;
  dy: number;
  inFrame: boolean;
  centered: boolean;
}

export interface CaptureBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FramingCallbacks {
  onStatus: (status: string) => void;
  onTracking: (update: TrackingUpdate) => void;
  onCapture: (trackId: number, box: CaptureBox) => void;
}

interface Candidate {
  trackId: number;
  box: CaptureBox;
  emaX: number;
  emaY: number;
  conf: number;
  inFrame: boolean;
  distFromCenter: number;
  leftEdge: number;
  rightEdge: number;
  topEdge: number;
  bottomEdge: number;
}

export class FramingController {
  private emaPositions = new Map<number, [number, number]>();
  private detectionStartTimes = new Map<number, number>();
  private dwellStartTimes = new Map<number, number>();
  private savedIds = new Set<number>();

  reset(): void {
    this.emaPositions.clear();
    this.detectionStartTimes.clear();
    this.dwellStartTimes.clear();
    this.savedIds.clear();
  }

  process(tracks: Track[], frameW: number, frameH: number, now: number, cb: FramingCallbacks): void {
    const candidates: Candidate[] = [];

    for (const track of tracks) {
      const id = track.id;

      if (!this.savedIds.has(id) && !this.detectionStartTimes.has(id)) {
        this.detectionStartTimes.set(id, now);
        cb.onStatus('focusing');
      }

      if (this.savedIds.has(id)) continue;
      const startTime = this.detectionStartTimes.get(id);
      if (startTime === undefined || now - startTime < START_DELAY) continue;

      const cx = (track.box.x1 + track.box.x2) / 2 / frameW;
      const cy = (track.box.y1 + track.box.y2) / 2 / frameH;
      const w = (track.box.x2 - track.box.x1) / frameW;
      const h = (track.box.y2 - track.box.y1) / frameH;

      const prev = this.emaPositions.get(id);
      const ema: [number, number] = prev
        ? [EMA_ALPHA * cx + (1 - EMA_ALPHA) * prev[0], EMA_ALPHA * cy + (1 - EMA_ALPHA) * prev[1]]
        : [cx, cy];
      this.emaPositions.set(id, ema);

      const leftEdge = cx - w / 2;
      const rightEdge = cx + w / 2;
      const topEdge = cy - h / 2;
      const bottomEdge = cy + h / 2;

      const inFrame =
        leftEdge >= BORDER_MARGIN &&
        rightEdge <= 1 - BORDER_MARGIN &&
        topEdge >= BORDER_MARGIN &&
        bottomEdge <= 1 - BORDER_MARGIN;

      candidates.push({
        trackId: id,
        box: { ...track.box },
        emaX: ema[0],
        emaY: ema[1],
        conf: track.box.conf,
        inFrame,
        distFromCenter: Math.hypot(ema[0] - 0.5, ema[1] - 0.5),
        leftEdge,
        rightEdge,
        topEdge,
        bottomEdge,
      });
    }

    if (candidates.length === 0) return;

    // Composite score: prefer centred paintings
    const rankingScore = (c: Candidate) => c.distFromCenter - 0.3 * c.conf;
    const fullyInFrame = candidates.filter(c => c.inFrame);
    const pool = fullyInFrame.length > 0 ? fullyInFrame : candidates;
    const active = pool.reduce((a, b) => (rankingScore(a) <= rankingScore(b) ? a : b));
    const canCapture = fullyInFrame.length > 0;

    const centered =
      canCapture &&
      Math.abs(active.emaX - 0.5) < CENTER_ZONE &&
      Math.abs(active.emaY - 0.5) < CENTER_ZONE &&
      active.conf > 0.85;

    cb.onTracking({
      dx: Math.round((active.emaX - 0.5) * 1000) / 1000,
      dy: Math.round((active.emaY - 0.5) * 1000) / 1000,
      inFrame: canCapture,
      centered,
    });

    if (!canCapture) {
      const violations: Record<string, number> = {
        left: BORDER_MARGIN - active.leftEdge,
        right: active.rightEdge - (1 - BORDER_MARGIN),
        top: BORDER_MARGIN - active.topEdge,
        bottom: active.bottomEdge - (1 - BORDER_MARGIN),
      };
      const activeViolations = Object.entries(violations).filter(([, v]) => v > 0);

      if (activeViolations.length >= 3) {
        cb.onStatus('out_of_frame_multiple');
      } else if (activeViolations.length > 0) {
        const [worstEdge] = activeViolations.reduce((a, b) => (a[1] >= b[1] ? a : b));
        cb.onStatus(`out_of_frame_${worstEdge}`);
      }
      return;
    }

    if (!this.dwellStartTimes.has(active.trackId)) {
      this.dwellStartTimes.set(active.trackId, now);
      cb.onStatus('centered');
    }

    if (now - this.dwellStartTimes.get(active.trackId)! >= DWELL_SECONDS) {
      this.savedIds.add(active.trackId);
      this.detectionStartTimes.delete(active.trackId);
      this.dwellStartTimes.delete(active.trackId);
      cb.onCapture(active.trackId, active.box);
    }

    const inFrameIds = new Set(candidates.filter(c => c.inFrame).map(c => c.trackId));
    for (const id of [...this.dwellStartTimes.keys()]) {
      if (!inFrameIds.has(id)) this.dwellStartTimes.delete(id);
    }

    if (this.savedIds.size >= 50) this.savedIds.clear();
  }
}
