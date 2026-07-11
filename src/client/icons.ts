/**
 * Hand-drawn "crayon" icons that replace every emoji. Each is an SVG string; Boot
 * rasterizes them into Phaser textures keyed `ic_<name>`. Style: dark-ink outline + the
 * item's colour, with a subtle feTurbulence "rough" wobble so it reads as crayon, not clip-art.
 */
import type * as Phaser from 'phaser';

const INK = '#3a2f22';
const PAPER = '#e7d6ac'; // negative space matches the panel behind the icons

// viewBox is 40; baked width/height 128 give crisp textures on high-DPR phones.
const wrap = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 40 40">` +
  `<defs><filter id="r"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="5" result="n"/>` +
  `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.4"/></filter></defs>` +
  `<g filter="url(#r)" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;

const dot = (x: number, y: number, r = 1.4): string => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}" stroke="none"/>`;

export const ICONS: Record<string, string> = {
  // ---- drums --------------------------------------------------------------
  kick: wrap(`<circle cx="20" cy="21" r="13" fill="#e2574c"/><circle cx="20" cy="21" r="5" fill="${PAPER}"/>${dot(11, 13)}${dot(29, 13)}${dot(11, 29)}${dot(29, 29)}`),
  snare: wrap(`<rect x="7" y="15" width="26" height="12" rx="2" fill="#4a7fd0"/><line x1="12" y1="15" x2="12" y2="27"/><line x1="17" y1="15" x2="17" y2="27"/><line x1="23" y1="15" x2="23" y2="27"/><line x1="28" y1="15" x2="28" y2="27"/><line x1="7" y1="30" x2="33" y2="30"/>`),
  hat: wrap(`<ellipse cx="20" cy="15" rx="13" ry="3.4" fill="#f2b705"/><ellipse cx="20" cy="21" rx="13" ry="3.4" fill="#f2b705"/><line x1="20" y1="21" x2="20" y2="34"/>`),
  clap: wrap(`<line x1="20" y1="5" x2="20" y2="11"/><line x1="9" y1="9" x2="13" y2="14"/><line x1="31" y1="9" x2="27" y2="14"/><path d="M12 20 Q14 15 20 17 Q26 15 28 20 Q28 30 20 32 Q12 30 12 20 Z" fill="#ef8a3c"/><line x1="20" y1="19" x2="20" y2="29"/>`),
  tom: wrap(`<ellipse cx="20" cy="22" rx="11" ry="12" fill="#d06bd0"/><ellipse cx="20" cy="15" rx="11" ry="3.4" fill="${PAPER}"/><line x1="9" y1="15" x2="9" y2="29"/><line x1="31" y1="15" x2="31" y2="29"/>`),
  // ---- bass ---------------------------------------------------------------
  bass: wrap(`<ellipse cx="15" cy="27" rx="9" ry="9" fill="#5bb974"/><circle cx="15" cy="27" r="3" fill="${PAPER}"/><path d="M20 22 L31 9" stroke-width="3"/><rect x="28" y="5" width="6" height="5" rx="1.5" fill="#5bb974"/>`),
  sub: wrap(`<rect x="9" y="7" width="22" height="26" rx="3" fill="#2f8a4e"/><circle cx="20" cy="23" r="7" fill="${PAPER}"/><circle cx="20" cy="23" r="2.5" fill="#2f8a4e"/><circle cx="20" cy="12" r="1.6" fill="${PAPER}"/>`),
  // ---- melody -------------------------------------------------------------
  pluck: wrap(`<ellipse cx="15" cy="28" rx="5" ry="4" fill="#9b6bd0"/><line x1="20" y1="28" x2="20" y2="9" stroke-width="2.6"/><path d="M20 9 Q28 11 28 18" fill="none" stroke-width="2.6"/>`),
  lead: wrap(`<rect x="6" y="12" width="28" height="18" rx="3" fill="#6f42ab"/><path d="M11 21 Q15 13 19 21 T27 21" fill="none" stroke="${PAPER}" stroke-width="2.4"/>`),
  keys: wrap(`<rect x="6" y="14" width="28" height="15" rx="2" fill="#7f6bd0"/><line x1="13" y1="14" x2="13" y2="29"/><line x1="20" y1="14" x2="20" y2="29"/><line x1="27" y1="14" x2="27" y2="29"/><rect x="10" y="14" width="3" height="8" fill="${INK}" stroke="none"/><rect x="24" y="14" width="3" height="8" fill="${INK}" stroke="none"/>`),
  bell: wrap(`<path d="M11 27 Q11 12 20 12 Q29 12 29 27 Z" fill="#3fb0ac"/><line x1="8" y1="27" x2="32" y2="27"/><circle cx="20" cy="31" r="2" fill="#3fb0ac"/>`),
  // ---- fx sounds ----------------------------------------------------------
  zap: wrap(`<path d="M23 5 L11 23 L18 23 L16 35 L30 15 L21 15 Z" fill="#ef476f"/>`),
  riser: wrap(`<path d="M20 7 L28 18 L23 18 L23 33 L17 33 L17 18 L12 18 Z" fill="#ffd166"/>`),
  drop: wrap(`<path d="M20 6 Q30 22 20 33 Q10 22 20 6 Z" fill="#3fb0ac"/>`),
  // ---- animals ------------------------------------------------------------
  bird: wrap(`<ellipse cx="17" cy="23" rx="11" ry="8.5" fill="#7fd0ff"/><path d="M27 20 L34 22 L27 25 Z" fill="#f2b705"/>${dot(22, 20, 1.5)}<path d="M12 22 Q17 27 22 23" fill="none"/><path d="M6 25 L11 22"/>`),
  cat: wrap(`<path d="M11 12 L14 20 L8 19 Z" fill="#ef8a3c"/><path d="M29 12 L26 20 L32 19 Z" fill="#ef8a3c"/><circle cx="20" cy="23" r="11" fill="#ef8a3c"/>${dot(16, 22)}${dot(24, 22)}<path d="M20 25 L18 27 M20 25 L22 27" fill="none"/><path d="M8 24 L14 25 M8 27 L14 27" fill="none"/><path d="M32 24 L26 25 M32 27 L26 27" fill="none"/>`),
  dog: wrap(`<ellipse cx="9" cy="18" rx="4" ry="7" fill="#d0a06b"/><ellipse cx="31" cy="18" rx="4" ry="7" fill="#d0a06b"/><circle cx="20" cy="22" r="11" fill="#d0a06b"/>${dot(16, 21)}${dot(24, 21)}<ellipse cx="20" cy="26" rx="2.6" ry="2" fill="${INK}" stroke="none"/>`),
  frog: wrap(`<circle cx="13" cy="14" r="4" fill="#6cba7d"/><circle cx="27" cy="14" r="4" fill="#6cba7d"/>${dot(13, 14, 1.3)}${dot(27, 14, 1.3)}<ellipse cx="20" cy="24" rx="13" ry="9" fill="#6cba7d"/><path d="M12 25 Q20 30 28 25" fill="none"/>`),
  // ---- voice --------------------------------------------------------------
  boom: wrap(`<path d="M20 5 L24 15 L34 13 L27 21 L33 30 L23 27 L20 35 L17 27 L7 30 L13 21 L6 13 L16 15 Z" fill="#9b6bd0"/>`),
  tss: wrap(`<ellipse cx="18" cy="24" rx="11" ry="3.2" fill="#4a7fd0"/><line x1="18" y1="24" x2="18" y2="32"/><line x1="24" y1="12" x2="27" y2="8"/><line x1="28" y1="16" x2="32" y2="14"/><line x1="26" y1="20" x2="31" y2="20"/>`),
  pah: wrap(`<circle cx="20" cy="21" r="7" fill="#e2574c"/><path d="M20 8 L20 4 M31 21 L35 21 M9 21 L5 21 M20 34 L20 38 M28 13 L31 10 M12 13 L9 10 M28 29 L31 32 M12 29 L9 32" fill="none"/>`),
  uh: wrap(`<rect x="14" y="6" width="12" height="17" rx="6" fill="#e86ea8"/><line x1="16" y1="12" x2="24" y2="12"/><line x1="16" y1="16" x2="24" y2="16"/><path d="M11 20 Q11 28 20 28 Q29 28 29 20" fill="none"/><line x1="20" y1="28" x2="20" y2="34"/><line x1="15" y1="34" x2="25" y2="34"/>`),

  // ---- batch 1: percussion, bass, mallets & synths ------------------------
  rim: wrap(`<circle cx="19" cy="20" r="12" fill="none" stroke-width="3"/><line x1="26" y1="13" x2="34" y2="8"/>`),
  cowbell: wrap(`<path d="M14 10 L26 10 L29 28 L11 28 Z" fill="#f2b705"/><line x1="15" y1="18" x2="25" y2="18"/>`),
  conga: wrap(`<path d="M12 13 Q20 9 28 13 L26 32 Q20 35 14 32 Z" fill="#d0794a"/><ellipse cx="20" cy="13" rx="8" ry="3" fill="${PAPER}"/>`),
  bongo: wrap(`<ellipse cx="14" cy="23" rx="7" ry="8" fill="#d0794a"/><ellipse cx="27" cy="23" rx="6" ry="7" fill="#c06a3a"/>`),
  woodblock: wrap(`<rect x="9" y="15" width="22" height="12" rx="2" fill="#c8935a"/><line x1="9" y1="21" x2="31" y2="21"/>`),
  shaker: wrap(`<ellipse cx="20" cy="21" rx="8" ry="12" fill="#8fd6a0"/>${dot(17, 16, 1.1)}${dot(22, 20, 1.1)}${dot(18, 25, 1.1)}`),
  tamb: wrap(`<circle cx="20" cy="21" r="11" fill="none" stroke-width="3"/><circle cx="20" cy="9" r="2.2" fill="#f2b705"/><circle cx="31" cy="21" r="2.2" fill="#f2b705"/><circle cx="9" cy="21" r="2.2" fill="#f2b705"/>`),
  clave: wrap(`<rect x="8" y="16" width="24" height="3.6" rx="1.8" fill="#c8935a"/><rect x="8" y="22" width="24" height="3.6" rx="1.8" fill="#c8935a"/>`),
  ride: wrap(`<ellipse cx="20" cy="18" rx="14" ry="4" fill="#e0b23a"/><line x1="20" y1="18" x2="20" y2="33"/>`),
  crash: wrap(`<ellipse cx="20" cy="21" rx="13" ry="4.5" fill="#f2c14e"/><line x1="6" y1="12" x2="9" y2="15"/><line x1="34" y1="12" x2="31" y2="15"/><line x1="20" y1="21" x2="20" y2="33"/>`),
  subsine: wrap(`<path d="M5 20 Q12 33 20 20 T35 20" fill="none" stroke="#2f8a4e" stroke-width="3.4"/>`),
  reese: wrap(`<path d="M6 26 L12 14 L12 26 L18 14 L18 26 L24 14 L24 26 L30 14 L30 26" fill="none" stroke="#3b9a63" stroke-width="2.4"/>`),
  pluckbass: wrap(`<line x1="8" y1="31" x2="32" y2="10"/><circle cx="12" cy="28" r="3.2" fill="#5bb974"/>`),
  growl: wrap(`<path d="M5 20 L10 14 L14 25 L18 12 L22 26 L26 14 L31 22 L35 18" fill="none" stroke="#1f6e44" stroke-width="2.6"/>`),
  marimba: wrap(`<rect x="8" y="15" width="6" height="15" rx="1" fill="#c8935a"/><rect x="17" y="12" width="6" height="18" rx="1" fill="#d0a06b"/><rect x="26" y="10" width="6" height="20" rx="1" fill="#c8935a"/>`),
  xylo: wrap(`<rect x="9" y="16" width="5" height="14" fill="#7fd0ff"/><rect x="17" y="14" width="5" height="16" fill="#e2574c"/><rect x="25" y="12" width="5" height="18" fill="#f2b705"/>${dot(30, 9, 2.3)}`),
  kalimba: wrap(`<path d="M10 30 Q20 7 30 30 Z" fill="#c8935a"/><line x1="15" y1="17" x2="15" y2="30"/><line x1="20" y1="13" x2="20" y2="30"/><line x1="25" y1="17" x2="25" y2="30"/>`),
  musicbox: wrap(`<rect x="8" y="14" width="24" height="18" rx="2" fill="#e86ea8"/><circle cx="16" cy="24" r="2.5" fill="${PAPER}"/><line x1="18" y1="24" x2="18" y2="17"/><path d="M18 17 Q24 18 24 22" fill="none"/>`),
  organ: wrap(`<rect x="8" y="13" width="4" height="19" fill="#6f42ab"/><rect x="14" y="8" width="4" height="24" fill="#7f6bd0"/><rect x="20" y="10" width="4" height="22" fill="#6f42ab"/><rect x="26" y="14" width="4" height="18" fill="#7f6bd0"/>`),
  saw: wrap(`<path d="M5 26 L13 11 L13 26 L21 11 L21 26 L29 11 L29 26" fill="none" stroke="#6f42ab" stroke-width="2.6"/>`),
  square: wrap(`<path d="M5 24 L12 24 L12 14 L20 14 L20 24 L28 24 L28 14 L34 14" fill="none" stroke="#9b6bd0" stroke-width="2.6"/>`),
  padwarm: wrap(`<path d="M6 24 Q6 14 16 15 Q19 8 27 13 Q35 13 33 22 Q34 28 26 27 L12 27 Q6 28 6 24 Z" fill="#7f6bd0"/>`),

  // ---- batch 2: animals, nature, fx & voice -------------------------------
  owl: wrap(`<ellipse cx="20" cy="22" rx="12" ry="11" fill="#9b8bd0"/><path d="M10 12 L14 18 M30 12 L26 18" fill="none"/><circle cx="15" cy="20" r="4" fill="${PAPER}"/><circle cx="25" cy="20" r="4" fill="${PAPER}"/>${dot(15, 20, 1.6)}${dot(25, 20, 1.6)}<path d="M20 24 L18 27 L22 27 Z" fill="#f2b705"/>`),
  duck: wrap(`<circle cx="18" cy="20" r="10" fill="#f2b705"/>${dot(20, 17, 1.5)}<path d="M27 20 L35 22 L27 25 Z" fill="#ef8a3c"/>`),
  cricket: wrap(`<ellipse cx="20" cy="23" rx="9" ry="6" fill="#97c459"/><line x1="14" y1="17" x2="10" y2="9"/><line x1="18" y1="16" x2="16" y2="8"/><line x1="12" y1="24" x2="7" y2="29"/><line x1="28" y1="24" x2="33" y2="29"/>`),
  cow: wrap(`<ellipse cx="20" cy="22" rx="12" ry="10" fill="${PAPER}"/><circle cx="11" cy="14" r="3" fill="#d0a06b"/>${dot(15, 20, 1.5)}${dot(25, 20, 1.5)}<ellipse cx="20" cy="27" rx="5" ry="3.5" fill="#f0b0c0"/>`),
  sheep: wrap(`<path d="M8 24 Q6 16 14 16 Q16 10 22 14 Q30 12 30 20 Q34 24 28 27 Q26 32 18 29 Q10 31 8 24 Z" fill="${PAPER}"/><circle cx="20" cy="24" r="5" fill="#c8935a"/>${dot(18, 23, 1.2)}${dot(22, 23, 1.2)}`),
  bee: wrap(`<ellipse cx="20" cy="22" rx="10" ry="7" fill="#f2c14e"/><line x1="17" y1="16" x2="17" y2="28"/><line x1="23" y1="16" x2="23" y2="28"/><ellipse cx="14" cy="14" rx="4" ry="3" fill="${PAPER}"/><ellipse cx="26" cy="14" rx="4" ry="3" fill="${PAPER}"/>`),
  wolf: wrap(`<path d="M8 12 L12 20 M32 12 L28 20" fill="none"/><path d="M11 18 Q20 14 29 18 L26 28 Q20 33 14 28 Z" fill="#8a95a8"/>${dot(16, 22, 1.4)}${dot(24, 22, 1.4)}<path d="M20 26 L18 29 L22 29 Z" fill="${INK}" stroke="none"/>`),
  rooster: wrap(`<circle cx="20" cy="23" r="10" fill="#e2574c"/><path d="M14 13 Q16 8 18 13 Q20 8 22 13 Q24 8 26 13" fill="#e2574c"/>${dot(23, 21, 1.4)}<path d="M29 23 L35 25 L29 27 Z" fill="#f2b705"/>`),
  rain: wrap(`<path d="M9 18 Q9 11 17 12 Q20 7 26 12 Q33 12 31 19 L11 19 Q8 20 9 18 Z" fill="#7fb0d0"/><line x1="14" y1="23" x2="12" y2="29"/><line x1="21" y1="23" x2="19" y2="30"/><line x1="28" y1="23" x2="26" y2="29"/>`),
  wind: wrap(`<path d="M6 15 Q20 11 24 15 Q28 19 22 20 L6 20" fill="none"/><path d="M6 25 Q26 21 30 26 Q33 30 27 31 L6 31" fill="none"/>`),
  thunder: wrap(`<path d="M9 16 Q9 9 17 10 Q20 5 26 10 Q33 10 31 17 L11 17 Q8 18 9 16 Z" fill="#6b6f8a"/><path d="M20 18 L15 26 L19 26 L17 34 L26 23 L21 23 Z" fill="#f2c14e"/>`),
  bubble: wrap(`<circle cx="17" cy="23" r="8" fill="none" stroke-width="2.6"/><circle cx="27" cy="14" r="4" fill="none"/><circle cx="14" cy="11" r="2.4" fill="none"/>`),
  drip: wrap(`<path d="M20 8 Q28 20 20 28 Q12 20 20 8 Z" fill="#3fb0ac"/><path d="M10 32 Q20 28 30 32" fill="none"/>`),
  laser: wrap(`<line x1="6" y1="30" x2="30" y2="10" stroke="#ef476f" stroke-width="3.4"/><circle cx="31" cy="9" r="3" fill="#ef476f"/><line x1="25" y1="6" x2="29" y2="3"/><line x1="34" y1="13" x2="37" y2="11"/>`),
  coin: wrap(`<circle cx="20" cy="20" r="12" fill="#f2b705"/><circle cx="20" cy="20" r="7.5" fill="none"/><line x1="20" y1="14" x2="20" y2="26"/>`),
  powerup: wrap(`<path d="M20 7 L28 18 L23 18 L23 30 L17 30 L17 18 L12 18 Z" fill="#97c459"/>${dot(31, 12, 1.4)}${dot(9, 26, 1.4)}`),
  siren: wrap(`<path d="M8 16 L14 16 L22 10 L22 30 L14 24 L8 24 Z" fill="#e2574c"/><path d="M27 14 Q32 20 27 26" fill="none"/><path d="M31 10 Q39 20 31 30" fill="none"/>`),
  warp: wrap(`<path d="M20 20 q6 -2 6 4 q0 8 -10 8 q-12 0 -12 -12 q0 -14 16 -14" fill="none" stroke="#6f42ab" stroke-width="2.6"/>`),
  glitch: wrap(`<rect x="8" y="12" width="10" height="7" fill="#4a7fd0"/><rect x="20" y="15" width="12" height="6" fill="#e2574c"/><rect x="12" y="23" width="14" height="6" fill="#4a7fd0"/><rect x="9" y="30" width="7" height="4" fill="#e2574c"/>`),
  beep: wrap(`<rect x="10" y="18" width="4" height="8" rx="1" fill="#3fb0ac"/><rect x="18" y="12" width="4" height="20" rx="1" fill="#3fb0ac"/><rect x="26" y="16" width="4" height="12" rx="1" fill="#3fb0ac"/>`),
  sparkle: wrap(`<path d="M20 6 Q22 18 34 20 Q22 22 20 34 Q18 22 6 20 Q18 18 20 6 Z" fill="#ffd166"/>`),
  yeah: wrap(`<path d="M8 10 L32 10 Q34 10 34 14 L34 24 Q34 28 30 28 L20 28 L14 33 L15 28 L12 28 Q8 28 8 24 Z" fill="#e86ea8"/><path d="M15 19 Q20 24 25 19" fill="none" stroke="${PAPER}"/>`),
  whistle: wrap(`<path d="M8 16 L24 16 Q30 16 30 22 Q30 28 24 28 L14 28 Q8 28 8 22 Z" fill="#ffd166"/><circle cx="24" cy="22" r="3" fill="${PAPER}"/><path d="M31 12 Q36 13 36 18" fill="none"/>`),
  hum: wrap(`<circle cx="18" cy="22" r="10" fill="#d48ab0"/><path d="M13 22 Q18 25 23 22" fill="none"/><path d="M29 18 Q33 22 29 26" fill="none"/>`),

  // ---- batch 3: keys, leads, plucks, pads, more perc & voice --------------
  harp: wrap(`<path d="M10 32 Q10 8 30 8" fill="none" stroke-width="3"/><line x1="10" y1="32" x2="30" y2="8"/><line x1="14" y1="26" x2="19" y2="16"/><line x1="18" y1="27" x2="23" y2="14"/><line x1="22" y1="28" x2="26" y2="12"/>`),
  flute: wrap(`<rect x="6" y="18" width="28" height="6" rx="3" fill="#7fd0ff"/>${dot(14, 21, 1.3)}${dot(20, 21, 1.3)}${dot(26, 21, 1.3)}`),
  brass: wrap(`<path d="M9 20 L22 20 L30 13 L30 27 L22 22 L9 22 Z" fill="#f2b705"/><circle cx="11" cy="21" r="4" fill="none"/>`),
  strings: wrap(`<path d="M6 22 Q14 10 20 22 T34 22" fill="none" stroke="#d06bd0" stroke-width="3"/><line x1="8" y1="30" x2="32" y2="12"/>`),
  choir: wrap(`<circle cx="20" cy="15" r="6" fill="#e86ea8"/><path d="M11 32 Q11 23 20 23 Q29 23 29 32 Z" fill="#e86ea8"/>`),
  glock: wrap(`<rect x="9" y="16" width="5" height="14" fill="#9fe1cb"/><rect x="18" y="14" width="5" height="16" fill="#5dcaa5"/><rect x="27" y="12" width="5" height="18" fill="#9fe1cb"/>${dot(30, 9, 2.2)}`),
  celesta: wrap(`<rect x="7" y="15" width="26" height="13" rx="2" fill="#bfe3ff"/><line x1="14" y1="15" x2="14" y2="28"/><line x1="20" y1="15" x2="20" y2="28"/><line x1="26" y1="15" x2="26" y2="28"/>`),
  banjo: wrap(`<circle cx="14" cy="26" r="8" fill="#c8935a"/><circle cx="14" cy="26" r="4" fill="${PAPER}"/><path d="M19 22 L32 9" stroke-width="3"/>`),
  sitar: wrap(`<ellipse cx="13" cy="28" rx="8" ry="7" fill="#d0794a"/><path d="M18 24 L33 7" stroke-width="3"/><circle cx="33" cy="7" r="2.5" fill="#d0794a"/>`),
  accordion: wrap(`<rect x="8" y="12" width="8" height="18" rx="2" fill="#ef8a3c"/><rect x="24" y="12" width="8" height="18" rx="2" fill="#ef8a3c"/><path d="M16 15 L24 15 M16 19 L24 19 M16 23 L24 23 M16 27 L24 27" fill="none"/>`),
  harmonica: wrap(`<rect x="6" y="16" width="28" height="9" rx="2" fill="#5bb974"/><line x1="12" y1="16" x2="12" y2="25"/><line x1="18" y1="16" x2="18" y2="25"/><line x1="24" y1="16" x2="24" y2="25"/><line x1="30" y1="16" x2="30" y2="25"/>`),
  epiano: wrap(`<rect x="7" y="16" width="26" height="12" rx="2" fill="#6f42ab"/><rect x="11" y="16" width="3" height="7" fill="${INK}" stroke="none"/><rect x="25" y="16" width="3" height="7" fill="${INK}" stroke="none"/>`),
  clav: wrap(`<rect x="8" y="15" width="24" height="13" rx="2" fill="#9b6bd0"/><line x1="14" y1="15" x2="14" y2="28"/><line x1="20" y1="15" x2="20" y2="28"/><line x1="26" y1="15" x2="26" y2="28"/>`),
  bellpad: wrap(`<path d="M12 26 Q12 12 20 12 Q28 12 28 26 Z" fill="#3fb0ac"/><line x1="9" y1="26" x2="31" y2="26"/><path d="M31 14 Q35 18 33 23" fill="none"/>`),
  pluckhi: wrap(`<ellipse cx="14" cy="27" rx="5" ry="4" fill="#7f6bd0"/><line x1="19" y1="27" x2="19" y2="9"/><path d="M19 9 Q27 10 27 17" fill="none"/>`),
  lead2: wrap(`<path d="M6 24 L13 24 L13 14 L21 14 L21 24 L29 24 L29 14 L34 14" fill="none" stroke="#ef476f" stroke-width="2.6"/>`),
  supersaw: wrap(`<path d="M6 26 L12 12 L12 26 L18 12 L18 26 L24 12 L24 26 L30 12 L30 26" fill="none" stroke="#534ab7" stroke-width="2.2"/>`),
  arp: wrap(`<path d="M7 28 L13 28 L13 22 L19 22 L19 16 L25 16 L25 10 L31 10" fill="none" stroke="#1d9e75" stroke-width="2.6"/>`),
  bass2: wrap(`<path d="M6 26 L14 12 L14 26 L22 12 L22 26 L30 12 L30 26" fill="none" stroke="#3b9a63" stroke-width="2.8"/>`),
  bass3: wrap(`<path d="M5 20 Q10 12 15 20 T25 20 T35 20" fill="none" stroke="#2f8a4e" stroke-width="3"/>`),
  wobble: wrap(`<path d="M5 20 Q9 6 13 20 Q17 32 21 20 Q25 8 29 20 Q33 30 37 20" fill="none" stroke="#639922" stroke-width="2.8"/>`),
  kick2: wrap(`<circle cx="20" cy="21" r="13" fill="#d85a30"/><circle cx="20" cy="21" r="5" fill="${PAPER}"/>${dot(11, 29, 1.4)}${dot(29, 29, 1.4)}`),
  snare2: wrap(`<rect x="7" y="15" width="26" height="12" rx="2" fill="#378add"/><line x1="7" y1="30" x2="33" y2="30"/><line x1="13" y1="15" x2="13" y2="27"/><line x1="27" y1="15" x2="27" y2="27"/>`),
  hat2: wrap(`<ellipse cx="20" cy="13" rx="13" ry="3.2" fill="#ef9f27"/><ellipse cx="20" cy="24" rx="13" ry="3.2" fill="#ef9f27"/><line x1="20" y1="24" x2="20" y2="34"/>`),
  clap2: wrap(`<line x1="20" y1="5" x2="20" y2="11"/><line x1="9" y1="9" x2="13" y2="14"/><line x1="31" y1="9" x2="27" y2="14"/><path d="M12 20 Q14 15 20 17 Q26 15 28 20 Q28 30 20 32 Q12 30 12 20 Z" fill="#d85a30"/>`),
  block: wrap(`<rect x="10" y="16" width="20" height="10" rx="2" fill="#c8935a"/><line x1="10" y1="21" x2="30" y2="21"/>`),
  tri: wrap(`<path d="M20 8 L32 30 L8 30 Z" fill="none" stroke="#5dcaa5" stroke-width="3"/><line x1="26" y1="30" x2="30" y2="34"/>`),
  doo: wrap(`<circle cx="17" cy="22" r="9" fill="#e86ea8"/><path d="M12 22 Q17 26 22 22" fill="none" stroke="${PAPER}"/><circle cx="30" cy="14" r="2.5" fill="#e86ea8"/><line x1="32" y1="14" x2="32" y2="8"/>`),
  beatbox: wrap(`<circle cx="20" cy="21" r="11" fill="#9b6bd0"/><ellipse cx="20" cy="23" rx="5" ry="6" fill="${INK}" stroke="none"/>`),
  ooh: wrap(`<circle cx="20" cy="21" r="11" fill="#d48ab0"/><circle cx="20" cy="22" r="5" fill="${INK}" stroke="none"/>`),

  // ---- per-beat wave targets (ink line-art) -------------------------------
  fx_vibrato: wrap(`<path d="M5 20 Q10 8 15 20 T25 20 T35 20" fill="none" stroke-width="3"/>`),
  fx_tremolo: wrap(`<path d="M7 16 L13 16 L19 10 L19 30 L13 24 L7 24 Z" fill="${INK}"/><path d="M24 15 Q28 20 24 25" fill="none"/><path d="M28 12 Q34 20 28 28" fill="none"/>`),
  fx_wah: wrap(`<path d="M6 28 C14 28 13 12 21 12 C29 12 28 22 34 20" fill="none" stroke-width="3"/>`),

  // ---- per-beat pitch + ratchet (musical notation) ------------------------
  // Pitch nudge arrows.
  pitch_up: wrap(`<path d="M20 7 L31 21 L24 21 L24 32 L16 32 L16 21 L9 21 Z" fill="#8fd6a0"/>`),
  pitch_dn: wrap(`<path d="M20 33 L9 19 L16 19 L16 8 L24 8 L24 19 L31 19 Z" fill="#e08f88"/>`),
  // Per-beat volume: a little speaker with + / −.
  vol_up: wrap(`<path d="M7 16 L13 16 L20 10 L20 30 L13 24 L7 24 Z" fill="#8fd6a0"/><line x1="27" y1="14" x2="27" y2="26" stroke-width="3"/><line x1="21" y1="20" x2="33" y2="20" stroke-width="3"/>`),
  vol_dn: wrap(`<path d="M7 16 L13 16 L20 10 L20 30 L13 24 L7 24 Z" fill="#e08f88"/><line x1="21" y1="20" x2="33" y2="20" stroke-width="3"/>`),
  // Ratchet = 1..4 beamed note-heads. The number of heads reads as the subdivision.
  sub1: wrap(`<ellipse cx="15" cy="29" rx="5" ry="3.6" fill="${INK}" stroke="none"/><line x1="19.6" y1="28" x2="19.6" y2="9"/>`),
  sub2: wrap(`<ellipse cx="10" cy="29" rx="4.6" ry="3.4" fill="${INK}" stroke="none"/><ellipse cx="26" cy="29" rx="4.6" ry="3.4" fill="${INK}" stroke="none"/><line x1="14.2" y1="28" x2="14.2" y2="10"/><line x1="30.2" y1="28" x2="30.2" y2="10"/><line x1="14.2" y1="10.5" x2="30.2" y2="10.5" stroke-width="3.2"/>`),
  sub3: wrap(`<ellipse cx="8" cy="29" rx="4" ry="3" fill="${INK}" stroke="none"/><ellipse cx="20" cy="29" rx="4" ry="3" fill="${INK}" stroke="none"/><ellipse cx="32" cy="29" rx="4" ry="3" fill="${INK}" stroke="none"/><line x1="11.6" y1="28" x2="11.6" y2="10"/><line x1="23.6" y1="28" x2="23.6" y2="10"/><line x1="35.6" y1="28" x2="35.6" y2="10"/><line x1="11.6" y1="10.5" x2="35.6" y2="10.5" stroke-width="3"/>`),
  sub4: wrap(`<ellipse cx="7" cy="29" rx="3.5" ry="2.7" fill="${INK}" stroke="none"/><ellipse cx="16" cy="29" rx="3.5" ry="2.7" fill="${INK}" stroke="none"/><ellipse cx="25" cy="29" rx="3.5" ry="2.7" fill="${INK}" stroke="none"/><ellipse cx="34" cy="29" rx="3.5" ry="2.7" fill="${INK}" stroke="none"/><line x1="10.2" y1="28" x2="10.2" y2="10"/><line x1="19.2" y1="28" x2="19.2" y2="10"/><line x1="28.2" y1="28" x2="28.2" y2="10"/><line x1="37.2" y1="28" x2="37.2" y2="10"/><line x1="10.2" y1="10.5" x2="37.2" y2="10.5" stroke-width="2.6"/><line x1="10.2" y1="14" x2="37.2" y2="14" stroke-width="2.6"/>`),

  // ---- UI -----------------------------------------------------------------
  play: wrap(`<path d="M14 10 L32 20 L14 30 Z" fill="#8fd6a0"/>`),
  pause: wrap(`<rect x="13" y="10" width="5.5" height="20" rx="2" fill="#8fd6a0"/><rect x="22" y="10" width="5.5" height="20" rx="2" fill="#8fd6a0"/>`),
  fs: wrap(`<path d="M8 15 L8 8 L15 8 M25 8 L32 8 L32 15 M32 25 L32 32 L25 32 M15 32 L8 32 L8 25" fill="none" stroke-width="2.8"/>`),
  exit: wrap(`<path d="M9 9 L16 16 M16 11 L16 16 L11 16 M31 31 L24 24 M24 29 L24 24 L29 24" fill="none" stroke-width="2.6"/>`),
  add: wrap(`<line x1="20" y1="10" x2="20" y2="30" stroke-width="3.2"/><line x1="10" y1="20" x2="30" y2="20" stroke-width="3.2"/>`),
  save: wrap(`<rect x="7" y="7" width="26" height="26" rx="3" fill="#3fb0ac"/><rect x="12" y="7" width="12" height="9" fill="${PAPER}"/><rect x="19" y="9" width="3" height="6" fill="${INK}" stroke="none"/><rect x="12" y="21" width="16" height="8" rx="1" fill="${PAPER}"/><line x1="15" y1="24" x2="25" y2="24"/><line x1="15" y1="27" x2="25" y2="27"/>`),
  rank: wrap(`<path d="M13 8 L27 8 L27 14 Q27 20 20 21 Q13 20 13 14 Z" fill="#f2b705"/><path d="M13 10 Q7 10 8 16 Q9 19 13 18" fill="none"/><path d="M27 10 Q33 10 32 16 Q31 19 27 18" fill="none"/><line x1="20" y1="21" x2="20" y2="27"/><rect x="14" y="27" width="12" height="4" rx="1" fill="#f2b705"/><rect x="11" y="31" width="18" height="4" rx="1" fill="#f2b705"/>`),
  clock: wrap(`<circle cx="20" cy="20" r="13" fill="none" stroke-width="3"/><line x1="20" y1="20" x2="20" y2="12"/><line x1="20" y1="20" x2="26" y2="22"/>`),
  gear: wrap(`<circle cx="20" cy="20" r="8.5" fill="#c9b487"/><circle cx="20" cy="20" r="3.4" fill="${PAPER}"/><line x1="20" y1="5" x2="20" y2="11"/><line x1="20" y1="29" x2="20" y2="35"/><line x1="5" y1="20" x2="11" y2="20"/><line x1="29" y1="20" x2="35" y2="20"/><line x1="9.5" y1="9.5" x2="13.8" y2="13.8"/><line x1="26.2" y1="26.2" x2="30.5" y2="30.5"/><line x1="30.5" y1="9.5" x2="26.2" y2="13.8"/><line x1="13.8" y1="26.2" x2="9.5" y2="30.5"/>`),
};

// The "JAMPAD" title wordmark: uppercase letters built FROM musical notation — J = a hooked stem
// with a note-head foot, A = two stems + a beam crossbar + note-head feet, M = two stems with a
// central valley, P = a stem + a filled note-head bulge, D = a big hollow half-note head on a
// stem. Wide aspect (660x170), rasterized separately from the square icons.
export const TITLE_SVG = `<svg width="660" height="170" viewBox="0 0 660 170" xmlns="http://www.w3.org/2000/svg"><g transform="translate(6,2)" fill="none" stroke="#3a2f22" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><g><line x1="46" y1="46" x2="96" y2="42" stroke="#e2574c" stroke-width="9"/><line x1="84" y1="44" x2="84" y2="110"/><path d="M84 110 C84 130 62 132 50 120"/><ellipse cx="48" cy="122" rx="16" ry="11" fill="#e2574c" stroke="none" transform="rotate(-20 48 122)"/></g><g><line x1="132" y1="130" x2="166" y2="48"/><line x1="204" y1="130" x2="170" y2="48"/><line x1="150" y1="92" x2="186" y2="92" stroke="#3fb0ac" stroke-width="7"/><ellipse cx="130" cy="132" rx="15" ry="10" fill="#3fb0ac" stroke="none" transform="rotate(-20 130 132)"/><ellipse cx="206" cy="132" rx="15" ry="10" fill="#3fb0ac" stroke="none" transform="rotate(-20 206 132)"/></g><g><line x1="232" y1="130" x2="232" y2="48"/><line x1="320" y1="130" x2="320" y2="48"/><path d="M232 50 L276 98 L320 50"/><ellipse cx="232" cy="132" rx="14" ry="10" fill="#f2b705" stroke="none" transform="rotate(-20 232 132)"/><ellipse cx="320" cy="132" rx="14" ry="10" fill="#f2b705" stroke="none" transform="rotate(-20 320 132)"/></g><g><line x1="350" y1="130" x2="350" y2="46"/><path d="M350 50 C398 44 412 86 372 94 C362 96 354 92 350 88" fill="#6f42ab" stroke-width="6"/><ellipse cx="350" cy="132" rx="15" ry="10" fill="#6f42ab" stroke="none" transform="rotate(-20 350 132)"/></g><g><line x1="446" y1="130" x2="480" y2="48"/><line x1="518" y1="130" x2="484" y2="48"/><line x1="464" y1="92" x2="500" y2="92" stroke="#ef8a3c" stroke-width="7"/><ellipse cx="444" cy="132" rx="15" ry="10" fill="#ef8a3c" stroke="none" transform="rotate(-20 444 132)"/><ellipse cx="516" cy="132" rx="15" ry="10" fill="#5bb974" stroke="none" transform="rotate(-20 516 132)"/></g><g><line x1="548" y1="130" x2="548" y2="46"/><path d="M548 48 C612 46 628 128 548 126" fill="#5bb974" stroke="#3a2f22" stroke-width="6"/><ellipse cx="548" cy="132" rx="15" ry="10" fill="#5bb974" stroke="none" transform="rotate(-20 548 132)"/></g></g></svg>`;

/** Rasterize one SVG string into a Phaser texture at the given pixel size. */
function rasterize(scene: Phaser.Scene, key: string, svg: string, w: number, h: number): Promise<void> {
  return new Promise((resolve) => {
    if (scene.textures.exists(key)) return resolve();
    const img = new Image();
    img.onload = (): void => {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        if (!scene.textures.exists(key)) scene.textures.addCanvas(key, cv);
      }
      resolve();
    };
    img.onerror = (): void => resolve();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Rasterize every icon (`ic_<name>`) + the title (`ic_title`) into textures (call from Boot). */
export async function loadIcons(scene: Phaser.Scene): Promise<void> {
  await Promise.all([
    ...Object.entries(ICONS).map(([name, svg]) => rasterize(scene, `ic_${name}`, svg, 128, 128)),
    rasterize(scene, 'ic_title', TITLE_SVG, 660, 170),
  ]);
}
