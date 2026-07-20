import { type Detection, intersectionOverUnion } from './yoloDetector';

export interface Track {
  id: number;
  box: Detection;
  lastSeen: number;
}

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

  update(detections: Detection[], now: number): Track[] {
    const matchedTrackIds = new Set<number>();
    const current: Track[] = [];

    const byConf = [...detections].sort((a, b) => b.conf - a.conf);
    for (const det of byConf) {
      let best: Track | null = null;
      let bestIou = this.matchIou;
      for (const track of this.tracks) {
        if (matchedTrackIds.has(track.id)) continue;
        const iou = intersectionOverUnion(track.box, det);
        if (iou >= bestIou) {
          bestIou = iou;
          best = track;
        }
      }
      if (best) {
        best.box = det;
        best.lastSeen = now;
        matchedTrackIds.add(best.id);
        current.push(best);
      } else {
        const track: Track = { id: this.nextId++, box: det, lastSeen: now };
        this.tracks.push(track);
        matchedTrackIds.add(track.id);
        current.push(track);
      }
    }

    this.tracks = this.tracks.filter(t => now - t.lastSeen <= this.maxAgeSeconds);
    return current;
  }
}
