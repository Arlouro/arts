import { type Detection, intersectionOverUnion } from './yoloDetector';

export interface Track {
  id: number;
  box: Detection;
  lastSeen: number;
  velocity: [number, number];
}

const VELOCITY_ALPHA = 0.6;

export class IouTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private readonly matchIou: number;
  private readonly maxAgeSeconds: number;

  constructor(matchIou = 0.3, maxAgeSeconds = 0.8) {
    this.matchIou = matchIou;
    this.maxAgeSeconds = maxAgeSeconds;
  }

  reset(): void {
    this.tracks = [];
  }

  private predictBox(track: Track, now: number): Detection {
    const dt = now - track.lastSeen;
    const [vx, vy] = track.velocity;
    return {
      x1: track.box.x1 + vx * dt,
      y1: track.box.y1 + vy * dt,
      x2: track.box.x2 + vx * dt,
      y2: track.box.y2 + vy * dt,
      conf: track.box.conf,
    };
  }

  update(detections: Detection[], now: number): Track[] {
    const matchedTrackIds = new Set<number>();
    const current: Track[] = [];

    const byConf = [...detections].sort((a, b) => b.conf - a.conf);
    for (const det of byConf) {
      let best: Track | null = null;
      let bestIou = this.matchIou;
      for (const track of this.tracks) {
        if (matchedTrackIds.has(track.id)) continue;
        const predicted = this.predictBox(track, now);
        const iou = intersectionOverUnion(predicted, det);
        if (iou >= bestIou) {
          bestIou = iou;
          best = track;
        }
      }
      if (best) {
        const dt = Math.max(now - best.lastSeen, 1e-3);
        const oldCx = (best.box.x1 + best.box.x2) / 2;
        const oldCy = (best.box.y1 + best.box.y2) / 2;
        const newCx = (det.x1 + det.x2) / 2;
        const newCy = (det.y1 + det.y2) / 2;
        const instVx = (newCx - oldCx) / dt;
        const instVy = (newCy - oldCy) / dt;
        best.velocity = [
          VELOCITY_ALPHA * instVx + (1 - VELOCITY_ALPHA) * best.velocity[0],
          VELOCITY_ALPHA * instVy + (1 - VELOCITY_ALPHA) * best.velocity[1],
        ];
        best.box = det;
        best.lastSeen = now;
        matchedTrackIds.add(best.id);
        current.push(best);
      } else {
        const track: Track = { id: this.nextId++, box: det, lastSeen: now, velocity: [0, 0] };
        this.tracks.push(track);
        matchedTrackIds.add(track.id);
        current.push(track);
      }
    }

    this.tracks = this.tracks.filter(t => now - t.lastSeen <= this.maxAgeSeconds);
    return current;
  }
}
