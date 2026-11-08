// Eldiven cekirdegi: paket cozme + yumruk algilama (tarayici ve node'da calisir)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FRAME = 64, SAMPLE = 12, PER = 5;
  const A = 16 / 32768, G = 2000 / 32768;

  // Gelen BLE parcalarini 64 baytlik paketlere birlestirir; her paket 5 ornek icerir.
  class Framer {
    constructor() { this.buf = []; }
    push(bytes, tNow) {
      for (let i = 0; i < bytes.length; i++) this.buf.push(bytes[i]);
      const out = [];
      while (this.buf.length >= FRAME) {
        const f = this.buf.splice(0, FRAME);
        for (let s = 0; s < PER; s++) {
          const o = s * SAMPLE, v = [];
          for (let k = 0; k < 6; k++) {
            let x = f[o + k * 2] | (f[o + k * 2 + 1] << 8);
            if (x & 0x8000) x -= 0x10000;
            v.push(x);
          }
          out.push({
            t: tNow - (PER - 1 - s) * 0.0111,
            a: Math.hypot(v[0] * A, v[1] * A, v[2] * A),   // ivme buyuklugu (g)
            g: Math.hypot(v[3] * G, v[4] * G, v[5] * G),   // donus hizi (derece/sn)
          });
        }
      }
      if (this.buf.length > 4096) this.buf = []; // senkron kaybi korumasi
      return out;
    }
  }

  // Yumruk: donus hizi esigi asilinca tepe izlenir; sinyal tepeden dusunce yumruk bildirilir ve
  // hemen sonraki yumruga hazirlanilir (arka arkaya hizli yumruklar ayri sayilir).
  class Detector {
    constructor(o = {}) { this.setSens(o.sens ?? 7); this.minA = o.minA ?? 1.6; this.fall = 0.55; this.maxw = 0.4; this.gap = 0.15; this.st = 0; this.cur = null; this.last = -9; }
    setSens(s) { this.hi = 800 - (s - 1) * 60; this.lo = this.hi * 0.6; }   // 1..10 -> 800..260 dps
    push(s) {
      if (this.st === 0) {
        if (s.g > this.hi && s.t - this.last > this.gap) { this.st = 1; this.cur = { t0: s.t, pa: s.a, pg: s.g }; }
        return null;
      }
      if (this.st === 1) {
        const c = this.cur;
        if (s.a > c.pa) c.pa = s.a;
        if (s.g > c.pg) c.pg = s.g;
        if (s.g < c.pg * this.fall || s.t - c.t0 > this.maxw) {
          this.st = 2; this.last = s.t;
          if (c.pa >= this.minA) return { t: c.t0, power: c.pa, speed: c.pg };
        }
        return null;
      }
      if (s.g < this.lo) this.st = 0;   // sakinlesince yeni yumruga hazir
      return null;
    }
  }
  return { Framer, Detector };
});
