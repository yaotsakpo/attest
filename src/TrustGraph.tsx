import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { api } from "../convex/_generated/api";
import { gradeFor } from "./grade";

// Atmospheric WebGL trust-map. Each observed domain is a glowing node orbiting a
// central "your agent" hub; links carry animated message-particles (email
// flowing agent<->domain); bloom gives it depth. Reads live Convex registry
// data — the graph IS the network. Reduced-motion → single static frame.

const GRADE_COLOR: Record<string, number> = {
  A: 0x34d399, // emerald
  B: 0x34d399,
  C: 0xf59e0b, // amber
  D: 0xf59e0b,
  F: 0xf87171, // red
};
const HUB_COLOR = 0x6366f1; // indigo (portfolio gradient start)

type DomainDoc = {
  domain: string;
  trustScore: number;
  verifiedCount: number;
  unverifiedCount: number;
};

export function TrustGraph() {
  const domains = useQuery(api.registry.listDomains);
  const mountRef = useRef<HTMLDivElement | null>(null);
  // live handle the animation loop reads from without re-initializing the scene
  const dataRef = useRef<DomainDoc[]>([]);

  useEffect(() => {
    dataRef.current = (domains ?? []) as DomainDoc[];
  }, [domains]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = mount.clientWidth;
    let height = mount.clientHeight || 260;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 0, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.setClearColor(0x1e1e2e, 0); // transparent → pane bg shows
    mount.appendChild(renderer.domElement);

    // bloom for the atmospheric glow
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.9, // strength
      0.6, // radius
      0.15, // threshold
    );
    composer.addPass(bloom);
    composer.setSize(width, height);

    // ambient starfield for atmosphere
    const starGeo = new THREE.BufferGeometry();
    const starN = 220;
    const starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 40;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 26;
      starPos[i * 3 + 2] = -8 - Math.random() * 20;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x45475a, size: 0.06, transparent: true, opacity: 0.7 }),
    );
    scene.add(stars);

    // hub
    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 32, 32),
      new THREE.MeshBasicMaterial({ color: HUB_COLOR }),
    );
    scene.add(hub);
    const hubGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 32, 32),
      new THREE.MeshBasicMaterial({ color: HUB_COLOR, transparent: true, opacity: 0.15 }),
    );
    scene.add(hubGlow);

    // node group — rebuilt when domain set changes
    const group = new THREE.Group();
    scene.add(group);

    type NodeObj = {
      domain: string;
      mesh: THREE.Mesh;
      line: THREE.Line;
      particles: THREE.Points;
      partData: Float32Array;
      base: THREE.Vector3;
      angle: number;
      ring: number;
      speed: number;
    };
    let nodes: NodeObj[] = [];
    let signature = "";

    function rebuild(data: DomainDoc[]) {
      const sig = data.map((d) => `${d.domain}:${d.trustScore.toFixed(3)}`).join("|");
      if (sig === signature) return;
      signature = sig;
      // clear
      for (const n of nodes) {
        group.remove(n.mesh, n.line, n.particles);
        n.mesh.geometry.dispose();
        (n.mesh.material as THREE.Material).dispose();
      }
      nodes = [];
      data.forEach((d, i) => {
        const g = gradeFor(d.trustScore, d.verifiedCount, d.unverifiedCount);
        const color = GRADE_COLOR[g] ?? 0xa6adc8;
        const ring = 4.2 + (i % 3) * 1.7 + (1 - d.trustScore) * 1.2;
        const angle = i * 2.399; // golden angle
        const r = 0.28 + d.trustScore * 0.5;
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(r, 24, 24),
          new THREE.MeshBasicMaterial({ color }),
        );
        const base = new THREE.Vector3(
          Math.cos(angle) * ring,
          Math.sin(angle) * ring * 0.62,
          Math.sin(angle * 1.7) * 1.6,
        );
        mesh.position.copy(base);

        // link
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          base.clone(),
        ]);
        const line = new THREE.Line(
          lineGeo,
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22 }),
        );

        // message-particles traveling the link
        const pN = 5;
        const partData = new Float32Array(pN); // t in [0,1) per particle
        for (let p = 0; p < pN; p++) partData[p] = Math.random();
        const partGeo = new THREE.BufferGeometry();
        partGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pN * 3), 3));
        const particles = new THREE.Points(
          partGeo,
          new THREE.PointsMaterial({ color, size: 0.22, transparent: true, opacity: 0.95 }),
        );

        group.add(mesh, line, particles);
        nodes.push({
          domain: d.domain,
          mesh,
          line,
          particles,
          partData,
          base,
          angle,
          ring,
          speed: 0.06 + d.trustScore * 0.12,
        });
      });
    }

    let raf = 0;
    let t = 0;
    function frame() {
      rebuild(dataRef.current);
      t += 0.006;
      // hide the hub entirely when there's nothing observed, so the empty-state
      // message doesn't collide with the glowing core
      const has = nodes.length > 0;
      hub.visible = has;
      hubGlow.visible = has;
      stars.visible = has;
      // slow living rotation of the whole graph
      group.rotation.y = Math.sin(t * 0.7) * 0.35;
      group.rotation.x = Math.cos(t * 0.5) * 0.12;
      hubGlow.scale.setScalar(1 + Math.sin(t * 2) * 0.06);

      for (const n of nodes) {
        // gentle orbital drift
        const a = n.angle + t * 0.25;
        n.mesh.position.set(
          Math.cos(a) * n.ring,
          Math.sin(a) * n.ring * 0.62,
          Math.sin(a * 1.7) * 1.6,
        );
        (n.line.geometry as THREE.BufferGeometry).setFromPoints([
          new THREE.Vector3(0, 0, 0),
          n.mesh.position.clone(),
        ]);
        // advance particles along the link (hub -> node)
        const pos = n.particles.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let p = 0; p < n.partData.length; p++) {
          n.partData[p] = (n.partData[p] + n.speed * 0.02) % 1;
          const tt = n.partData[p];
          pos.setXYZ(
            p,
            n.mesh.position.x * tt,
            n.mesh.position.y * tt,
            n.mesh.position.z * tt,
          );
        }
        pos.needsUpdate = true;
      }

      composer.render();
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    frame();

    function onResize() {
      width = mount!.clientWidth;
      height = mount!.clientHeight || 260;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      composer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  const count = domains?.length ?? 0;
  return (
    <div className="term">
      <div className="term-bar">
        <span className="term-lights">
          <span className="term-light tl-r" />
          <span className="term-light tl-y" />
          <span className="term-light tl-g" />
        </span>
        <span className="term-path">agent@jobcopilot ~ trust-map</span>
        <span className="term-tag">
          {count} node{count === 1 ? "" : "s"}
        </span>
      </div>
      <div className="graph-webgl" ref={mountRef}>
        {count === 0 && (
          <p className="graph-empty">
            The map fills as your agent observes authenticated email.
          </p>
        )}
      </div>
    </div>
  );
}
