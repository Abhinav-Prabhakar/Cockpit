import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* Collapse every static mesh under `root` into one mesh per material.
   Only call on groups whose meshes never move independently
   (materials may still animate: colors/emissive are shared). */
export function mergeStatic(root, { skip = () => false } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || skip(o)) return;
    if (o.userData.ctrl || o.children.length) return;
    for (let a = o.parent; a && a !== root; a = a.parent) if (a.userData.noMerge) return;
    const m = o.material;
    if (m.transparent && m.blending === THREE.AdditiveBlending) return; // keep additive FX separate
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    const mat = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    g.applyMatrix4(mat);
    const key = m.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
    if (!buckets.has(key)) buckets.set(key, { m, geos: [], cast: o.castShadow, recv: o.receiveShadow });
    buckets.get(key).geos.push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  let made = 0;
  for (const { m, geos, cast, recv } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m); mesh.castShadow = cast; mesh.receiveShadow = recv;
    root.add(mesh); made++;
  }
  return { removed: victims.length, made };
}
