import type { Job, SystemStatus } from "../../../lib/types";
export type Obstacle = { x: number; z: number; width: number; depth: number };
export const BINS: Obstacle[] = [3.4, -.6, -4.6].flatMap((z) => [-3.3, 3.3].map((x) => ({ x, z, width: 3.4, depth: 1.35 })));
export const OBSTACLES: Obstacle[] = [...BINS, { x: 0, z: -7.35, width: 7.6, depth: 1.3 }, { x: -5.85, z: -1, width: .8, depth: 12 }, { x: 5.85, z: -1, width: .8, depth: 12 }];
export function canStand(x: number, z: number) {
  const radius = .25;
  return Math.abs(x) < 6.15 - radius && z > -8.7 + radius && z < 8.7 - radius &&
    !OBSTACLES.some((o) => Math.abs(x-o.x) < o.width/2+radius && Math.abs(z-o.z) < o.depth/2+radius);
}
export function generationBlock(jobs: Pick<Job, 'status' | 'engine'>[], status: SystemStatus | null): string | null {
  if (status?.model_activity) return `${status.model_activity.name} is using the AI models.`;
  if (jobs.some((j) => j.engine !== 'stub' && ['waiting','downloading','planning','generating','synthesizing','decoding'].includes(j.status))) return 'Music generation is in progress.';
  return null;
}
export const RECORDS_PER_ROOM = 36;
