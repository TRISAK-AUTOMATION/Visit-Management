// client/src/components/BadgeScene.jsx
// บัตรพนักงาน 3 มิติ (Three.js) แยกเป็น 6 ชั้น หมุนตามเมาส์ แยก/ประกอบตามสถานะของหน้า Login
// โหลด three แบบ lazy (dynamic import) เพื่อไม่ให้หน้า Login ช้าลง — ถ้า WebGL ใช้ไม่ได้จะเรียก onUnavailable
import React, { useEffect, useRef } from 'react';
import logoBlue from '../assets/trisak-logo-blue.png';

const W = 1.9;
const H = 2.6;
const GAP = 0.36; // ระยะห่างระหว่างชั้นตอนแยกเต็มที่
const LAYERS = 6;
// ตำแหน่ง z ของแต่ละชั้น: ชั้น 0 (แผ่นหลัง) อยู่ที่ 0, ชั้นอื่นต้องพ้นผิวหน้าแผ่นหลัง (~0.042) เสมอแม้ประกอบเต็มที่ (e = 0)
const zOf = (i, e) => (i === 0 ? 0 : 0.055 + i * (0.014 + GAP * e));

export default function BadgeScene({ typed, submitting, pointer, onUnavailable }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const stateRef = useRef({ name: typed, submitting });

  useEffect(() => {
    stateRef.current.name = typed;
    if (apiRef.current) apiRef.current.redraw();
  }, [typed]);

  useEffect(() => {
    stateRef.current.submitting = submitting;
  }, [submitting]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        const THREE = await import('three');
        if (disposed) return;
        const el = mountRef.current;
        if (!el) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.1, 50);
        camera.position.set(0, 0, 7.4);

        scene.add(new THREE.AmbientLight(0xffffff, 2.2));
        const key = new THREE.DirectionalLight(0xffffff, 1.3);
        key.position.set(-2, 3, 4);
        scene.add(key);

        // ---------- helpers ----------
        const rrPath = (w, h, r) => {
          const x = -w / 2, y = -h / 2;
          const s = new THREE.Shape();
          s.moveTo(x + r, y);
          s.lineTo(x + w - r, y);
          s.quadraticCurveTo(x + w, y, x + w, y + r);
          s.lineTo(x + w, y + h - r);
          s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
          s.lineTo(x + r, y + h);
          s.quadraticCurveTo(x, y + h, x, y + h - r);
          s.lineTo(x, y + r);
          s.quadraticCurveTo(x, y, x + r, y);
          return s;
        };
        const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.05, ...extra });

        // ---------- textures (วาดด้วย canvas เพื่อให้เปลี่ยนตามชื่อที่พิมพ์ได้) ----------
        const logoImg = new Image();
        const printCv = document.createElement('canvas'); printCv.width = 512; printCv.height = 700;
        const photoCv = document.createElement('canvas'); photoCv.width = 256; photoCv.height = 256;
        const printTex = new THREE.CanvasTexture(printCv);
        const photoTex = new THREE.CanvasTexture(photoCv);
        printTex.colorSpace = photoTex.colorSpace = THREE.SRGBColorSpace;
        printTex.anisotropy = photoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

        const bar = (c, x, y, w, h, color) => {
          c.fillStyle = color;
          c.beginPath();
          c.roundRect ? c.roundRect(x, y, w, h, h / 2) : c.rect(x, y, w, h);
          c.fill();
        };

        const redraw = () => {
          const name = (stateRef.current.name || '').trim();
          const p = printCv.getContext('2d');
          p.clearRect(0, 0, 512, 700);
          if (logoImg.complete && logoImg.naturalWidth) {
            const lw = 330, lh = (lw * logoImg.naturalHeight) / logoImg.naturalWidth;
            p.drawImage(logoImg, (512 - lw) / 2, 330, lw, lh);
          }
          if (name) {
            p.fillStyle = '#003766';
            p.font = '600 40px "IBM Plex Sans Thai", system-ui, sans-serif';
            p.textAlign = 'center';
            p.fillText(name.length > 14 ? name.slice(0, 14) + '…' : name, 256, 505);
          } else {
            bar(p, 146, 470, 220, 18, '#9CC4E6');
          }
          bar(p, 186, 530, 140, 14, '#D5E6F5');

          const c = photoCv.getContext('2d');
          c.clearRect(0, 0, 256, 256);
          c.fillStyle = '#0065B3';
          c.beginPath(); c.arc(128, 128, 124, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#fff';
          if (name) {
            c.font = '600 124px "IBM Plex Sans Thai", system-ui, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(name.charAt(0).toUpperCase(), 128, 138);
          } else {
            c.fillStyle = '#BBD6EE';
            c.beginPath(); c.arc(128, 100, 38, 0, Math.PI * 2); c.fill();
            c.beginPath(); c.ellipse(128, 214, 70, 52, 0, Math.PI, 0); c.fill();
          }
          printTex.needsUpdate = true;
          photoTex.needsUpdate = true;
        };
        logoImg.onload = redraw;
        logoImg.src = logoBlue;
        redraw();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!disposed) redraw(); });
        apiRef.current = { redraw };

        // ---------- layers ----------
        const rig = new THREE.Group();
        scene.add(rig);
        const layers = [];
        for (let i = 0; i < LAYERS; i++) { const g = new THREE.Group(); layers.push(g); rig.add(g); }

        // 0 แผ่นหลัง
        const backGeo = new THREE.ExtrudeGeometry(rrPath(W, H, 0.16), { depth: 0.06, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
        backGeo.translate(0, 0, -0.03);
        layers[0].add(new THREE.Mesh(backGeo, std(0xffffff, { roughness: 0.3, emissive: 0x303030 })));

        // 1 รูปถ่าย
        const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: photoTex, transparent: true, depthWrite: false }));
        photo.renderOrder = 1;
        photo.position.set(0, 0.62, 0);
        layers[1].add(photo);

        // 2 โลโก้ + ชื่อ
        const print = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: printTex, transparent: true, depthWrite: false }));
        print.renderOrder = 2;
        layers[2].add(print);

        // 3 ชิป + QR
        const chip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.05), std(0x0065b3, { metalness: 0.55, roughness: 0.3 }));
        chip.position.set(-0.6, -0.98, 0);
        layers[3].add(chip);
        const qrColors = [0x003766, 0x003766, 0x003766, 0x8cc0ea];
        qrColors.forEach((col, k) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.04), std(col));
          m.position.set(0.52 + (k % 2) * 0.14, -0.91 - Math.floor(k / 2) * 0.14, 0);
          layers[3].add(m);
        });

        // 4 ฟิล์มเคลือบ (กรอบ + แผ่นใสบางๆ)
        const frame = rrPath(W, H, 0.16);
        frame.holes.push(new THREE.Path(rrPath(W - 0.09, H - 0.09, 0.13).getPoints(12)));
        const frameMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(frame, { depth: 0.02, bevelEnabled: false }), std(0x8cc0ea, { roughness: 0.25 }));
        layers[4].add(frameMesh);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }));
        glass.position.z = 0.012;
        glass.renderOrder = 5;
        layers[4].add(glass);

        // 5 ช่องคล้องสาย
        const clip = new THREE.Mesh(new THREE.ExtrudeGeometry(rrPath(0.62, 0.2, 0.1), { depth: 0.05, bevelEnabled: false }), std(0x003766));
        clip.position.set(0, 1.12, -0.025);
        layers[5].add(clip);
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: 0x66b2f0 }));
        dot.position.set(0, 1.12, 0.03);
        layers[5].add(dot);

        // แถบสแกนตอนกดเข้าสู่ระบบ
        const scan = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.1, 0.5), new THREE.MeshBasicMaterial({ color: 0x66b2f0, transparent: true, opacity: 0.4, depthWrite: false }));
        scan.visible = false;
        scan.renderOrder = 10;
        rig.add(scan);

        // ปรับขนาดตามพื้นที่จริง (จอเปลี่ยนขนาด/ย่อขยายหน้าต่าง)
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
          const w = el.clientWidth, h = el.clientHeight;
          if (!w || !h) return;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }) : null;
        if (ro) ro.observe(el);

        // ---------- loop ----------
        let visible = true;
        const io = 'IntersectionObserver' in window ? new IntersectionObserver(([en]) => { visible = en.isIntersecting; }) : null;
        if (io) io.observe(el);

        const clock = new THREE.Clock();
        let e = 0.35, tx = 0, ty = 0, raf = 0, first = true;

        const loop = () => {
          raf = requestAnimationFrame(loop);
          if (document.hidden || !visible) return;
          const t = clock.getElapsedTime();
          const p = pointer.current;
          const st = stateRef.current;
          const target = st.submitting ? 0 : p.hover ? 1 : (st.name && st.name.trim() ? 0.12 : 0.35);
          e += (target - e) * 0.08;
          tx += (p.x - tx) * 0.08;
          ty += (p.y - ty) * 0.08;

          rig.rotation.set(0.16 - ty * 0.22, -0.42 + tx * 0.32, -0.05);
          rig.position.y = Math.sin(t * 1.1) * 0.05;
          rig.position.z = -zOf(LAYERS - 1, e) / 2;
          layers.forEach((g, i) => { g.position.z = zOf(i, e); });
          key.position.set(-2 + tx * 2, 3 - ty * 2, 4);

          if (st.submitting) {
            scan.visible = true;
            scan.position.y = 1.5 - ((t * 0.9) % 1) * 3;
            scan.position.z = zOf(LAYERS - 1, e) + 0.06;
          } else {
            scan.visible = false;
          }

          renderer.render(scene, camera);
          if (first) { first = false; el.style.opacity = '1'; }
        };
        loop();

        cleanup = () => {
          cancelAnimationFrame(raf);
          if (io) io.disconnect();
          if (ro) ro.disconnect();
          apiRef.current = null;
          scene.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
          });
          printTex.dispose();
          photoTex.dispose();
          renderer.dispose();
          if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        };
        if (disposed) cleanup();
      } catch (err) {
        if (!disposed && onUnavailable) onUnavailable(err);
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', opacity: 0, transition: 'opacity .6s ease' }} aria-hidden="true" />;
}
