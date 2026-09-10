import React, { useEffect, useRef } from 'react';

// Landing sayfasının hero bölümü için dekoratif, sadece web'de render edilen
// "kara delik" tarzı parçacık animasyonu -- kullanıcının paylaştığı hazır
// bileşenin kendisi değil (o bileşenin gerçek çizim mantığı ayrı bir
// "black-hole-utils/renderer" dosyasındaydı ve elimizde yoktu), bu projenin
// kendi koyu lacivert/altın marka paletine göre sıfırdan yazılmış, hafif bir
// canvas parçacık sistemi: küçük ışık noktaları merkeze doğru spiral çizerek
// akıyor, merkeze yaklaşınca kenardan yeniden başlıyor. Sadece dekoratif
// olduğu için native tarafta hiç render edilmiyor (bkz. BlackHoleBackground.tsx).
type Props = {
  // Parçacık dağılımının merkezinin yatayda nerede olacağı (0 = sol kenar,
  // 0.5 = tam orta, 1 = sağ kenar). Landing hero'da metin solda kaldığı için
  // merkez sağa kaydırılıyor (0.72); ortalanmış tek-sütun form ekranlarında
  // (login/register/vb.) 0.5 ile tam ortalanır.
  centerX?: number;
  // Dağılımın yarıçapını çarpan -- 1 varsayılan, >1 "balonları" daha geniş
  // bir alana yayar (parçacık sayısı da orantılı artırılır ki seyrekleşmesin).
  spread?: number;
};

export default function BlackHoleBackground({ centerX = 0.72, spread = 1 }: Props = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rafId = 0;
    let disposed = false;

    type Particle = {
      angle: number;
      radius: number;
      speed: number;
      spin: number;
      size: number;
      hue: 'blue' | 'gold';
    };

    const PARTICLE_COUNT = Math.round(140 * spread);
    let particles: Particle[] = [];
    let maxRadius = 0;

    function makeParticle(seedAtEdge = false): Particle {
      const angle = Math.random() * Math.PI * 2;
      const radius = seedAtEdge ? maxRadius * (0.75 + Math.random() * 0.3) : Math.random() * maxRadius;
      return {
        angle,
        radius,
        speed: 0.15 + Math.random() * 0.35,
        spin: 0.002 + Math.random() * 0.006,
        size: 0.6 + Math.random() * 1.6,
        hue: Math.random() < 0.78 ? 'blue' : 'gold',
      };
    }

    function resize() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : 420;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      maxRadius = Math.max(width, height) * 0.62 * spread;
      particles = Array.from({ length: PARTICLE_COUNT }, () => makeParticle(false));
    }

    function frame() {
      if (disposed || !ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width * centerX;
      const cy = height * 0.42;

      // Merkez kor parlaması
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 0.35);
      coreGrad.addColorStop(0, 'rgba(59,130,246,0.22)');
      coreGrad.addColorStop(0.5, 'rgba(59,130,246,0.08)');
      coreGrad.addColorStop(1, 'rgba(59,130,246,0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, maxRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      for (const p of particles) {
        p.angle += p.spin * (1 + (1 - p.radius / maxRadius) * 2.5);
        p.radius -= p.speed;
        if (p.radius <= maxRadius * 0.06) {
          Object.assign(p, makeParticle(true));
        }
        const x = cx + Math.cos(p.angle) * p.radius;
        const y = cy + Math.sin(p.angle) * p.radius * 0.55; // hafif elips -- düz daireden daha "disk" hissi
        const fade = Math.min(1, (maxRadius - p.radius) / (maxRadius * 0.25));
        const alpha = 0.15 + fade * 0.55;
        const color = p.hue === 'gold' ? `rgba(232,151,124,${alpha})` : `rgba(96,165,250,${alpha})`;
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(frame);
    }

    resize();
    rafId = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
