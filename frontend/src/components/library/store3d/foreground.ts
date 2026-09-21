import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';

export const FOREGROUND_LAYER = 1;

export function foreground(object: Object3D) {
  object.traverse(child => child.layers.set(FOREGROUND_LAYER));
}

/** Draw held objects with their own shared depth buffer, above the shop. */
export function renderStore(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  const mask = camera.layers.mask;
  const background = scene.background;
  const fog = scene.fog;
  const autoClear = renderer.autoClear;
  try {
    renderer.autoClear = false;
    renderer.clear();
    camera.layers.set(0);
    renderer.render(scene, camera);
    renderer.clearDepth();
    scene.background = null;
    scene.fog = null;
    camera.layers.set(FOREGROUND_LAYER);
    renderer.render(scene, camera);
  } finally {
    camera.layers.mask = mask;
    scene.background = background;
    scene.fog = fog;
    renderer.autoClear = autoClear;
  }
}
