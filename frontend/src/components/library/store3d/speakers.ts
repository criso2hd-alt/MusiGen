import { BufferAttribute, Matrix4, Mesh, Vector3 } from 'three';

export type SpeakerBand = 'big' | 'small';

/** FFT bins are mapped using the actual audio-device sample rate. */
export function speakerEnergy(freq: Uint8Array, sampleRate: number, band: SpeakerBand) {
  if (!freq.length || sampleRate <= 0) return 0;
  const rms = (low: number, high: number) => {
    const hz = sampleRate / (2 * freq.length);
    const first = Math.max(1, Math.ceil(low / hz)), last = Math.min(freq.length - 1, Math.floor(high / hz));
    let sum = 0;
    for (let i = first; i <= last; i++) sum += (freq[i] / 255) ** 2;
    return last < first ? 0 : Math.sqrt(sum / (last - first + 1));
  };
  return band === 'big' ? .8 * rms(40, 300) + .2 * rms(300, 2000) : rms(2500, 12000);
}

/** Deform each half about its own center, never scale the merged L/R spacing. */
export function createSpeakerMotion(mesh: Mesh, band: SpeakerBand) {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.getAttribute('position') as BufferAttribute;
  const original = Float32Array.from(position.array), world: Vector3[] = [];
  const inverse = new Matrix4().copy(mesh.matrixWorld).invert();
  const limits = [0, 1].map(() => ({min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity)}));
  for (let i = 0; i < position.count; i++) {
    const point = new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    world.push(point);
    const bounds = limits[point.x < 0 ? 0 : 1]; bounds.min.min(point); bounds.max.max(point);
  }
  const centers = limits.map(({min, max}) => min.clone().add(max).multiplyScalar(.5));
  const temp = new Vector3();
  let envelope = 0, moving = false;
  return {
    update(delta: number, energy: number) {
      const target = Math.max(0, Math.min(1, energy));
      envelope += (target - envelope) * (1 - Math.exp(-delta * (target > envelope ? 24 : 12)));
      if (!target && envelope < .001) {
        envelope = 0;
        if (moving) { position.copyArray(original); position.needsUpdate = true; mesh.geometry.computeVertexNormals(); moving = false; }
        return;
      }
      if (!envelope) return;
      const pulse = envelope;
      const radial = 1 + pulse * (band === 'big' ? .035 : .018);
      for (let i = 0; i < world.length; i++) {
        const point = world[i], center = centers[point.x < 0 ? 0 : 1];
        temp.set(center.x + (point.x - center.x) * radial, center.y + (point.y - center.y) * radial,
          center.z + (point.z - center.z) * (1 - pulse * .08) + pulse * (band === 'big' ? .012 : .004));
        temp.applyMatrix4(inverse); position.setXYZ(i, temp.x, temp.y, temp.z);
      }
      position.needsUpdate = true; mesh.geometry.computeVertexNormals(); moving = true;
    },
  };
}
