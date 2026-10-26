// Parts of the podcast pack's template tracks (phase 2 «Звуки», D14 «Звуковые эффекты», user 2026-10-26): the in and
// out sounds of one template, cut from its 9.64 s track so they follow the template at any length — the in part goes
// from the template's start, the out part ends with it (companions placed `in` and `out`, spec 6.1 step 9).
// Every track of the pack plays one 10 s scene: the podcast frame flies in with a punch (0.25-0.85 s, the same in
// every track), the element comes in, a bed runs under the hold, the element leaves, the frame flies out with a
// punch. The library splits the scene: POD_Frame is the frame, the elements are templates of their own. So
// - an element's in part starts where the element starts in the pack (its masters' ref.json shift), but not
//   before the end of the frame's punch (0.85 s): its sounds come up to 0.37 s earlier than in the pack, with the
//   element's first frame; it ends where the element's intro ends (the master's introSec at 1×);
// - an element's out part ends at the quiet moment right before the frame's punch (the element has left) and starts
//   the master's outroSec plus 0.3 s of the bed before it;
// - the frame's parts are the punches (cut from «Текст на плашке_1», on whose times POD_Frame was built).
// Times in seconds of the parent's file (the library file: the template tracks keep the pack's timing, process.mjs
// rule). The parts are cut from the built parent: its level, no other gain.
// Measured on the build PC 2026-10-26 (50 ms RMS of the tracks, the motion of the pack's previews and of the masters'):
// the punch ends at 0.85 s (-27..-30 dB after its -11 dB peak); the out ends below sit at the dip before the punch.

export const IN_FADE = { in: 0.03, out: 0.3 };
export const OUT_FADE = { in: 0.3, out: 0.03 };

const part = (id, from, start, end, fade, title_ru, keywords) => ({ id, from, start, end, fade, title_ru, keywords });
const inPart = (id, from, start, end, title, keywords) => part(id, from, start, end, IN_FADE, `${title} — появление`, `${keywords} In`);
const outPart = (id, from, start, end, title, keywords) => part(id, from, start, end, OUT_FADE, `${title} — уход`, `${keywords} Out`);

export const PARTS = [
  // TTL_LowerThird, style «Подкаст»: the element at 0.6 s, intro 2.2 s; out: the rise of the plate's exit up to 9.1 s
  // (the frame's punch from 9.15 s), outro 2.0 s
  inPart('SFX_PodcastLowerThirdIn', 'SFX_PodcastLowerThird', 0.85, 2.8, 'Подкаст: подпись спикера', 'Podcast Lower Third'),
  outPart('SFX_PodcastLowerThirdOut', 'SFX_PodcastLowerThird', 6.8, 9.1, 'Подкаст: подпись спикера', 'Podcast Lower Third'),
  // TTL_Plate, style «Подкаст» (built on «Текст на плашке_1»): the first plate at 1.2 s, intro 2.84 s; the plates'
  // exit swoosh up to 8.72 s, outro 2.96 s
  inPart('SFX_PodcastTextPlateIn', 'SFX_PodcastTextPlate1', 1.2, 4.04, 'Подкаст: текст на плашке', 'Podcast Text Plate'),
  outPart('SFX_PodcastTextPlateOut', 'SFX_PodcastTextPlate1', 5.46, 8.72, 'Подкаст: текст на плашке', 'Podcast Text Plate'),
  // POD_Guest: the card at 0.68 s, intro 1.24 s; its exit swoosh up to 8.62 s, outro 1.24 s
  inPart('SFX_PodcastGuestIn', 'SFX_PodcastGuest', 0.85, 1.92, 'Подкаст: о госте', 'Podcast Guest'),
  outPart('SFX_PodcastGuestOut', 'SFX_PodcastGuest', 7.08, 8.62, 'Подкаст: о госте', 'Podcast Guest'),
  // POD_Content by «Сторона» (left «Контент_1», right «Контент_2», centre «Контент_3»): the window at 0.68 s (centre
  // 1.04 s), intro 2.64 s; the window's exit up to the dip before the punch, outro 1.68 s
  inPart('SFX_PodcastContent1In', 'SFX_PodcastContent1', 0.85, 3.32, 'Подкаст: контент 1', 'Podcast Content 1'),
  outPart('SFX_PodcastContent1Out', 'SFX_PodcastContent1', 6.7, 8.68, 'Подкаст: контент 1', 'Podcast Content 1'),
  inPart('SFX_PodcastContent2In', 'SFX_PodcastContent2', 0.85, 3.32, 'Подкаст: контент 2', 'Podcast Content 2'),
  outPart('SFX_PodcastContent2Out', 'SFX_PodcastContent2', 6.69, 8.67, 'Подкаст: контент 2', 'Podcast Content 2'),
  inPart('SFX_PodcastContent3In', 'SFX_PodcastContent3', 1.04, 3.68, 'Подкаст: контент 3', 'Podcast Content 3'),
  outPart('SFX_PodcastContent3Out', 'SFX_PodcastContent3', 6.74, 8.72, 'Подкаст: контент 3', 'Podcast Content 3'),
  // POD_QR by «Раскладка» (left «QR_код_1», right «QR_код_2», centre «Подписывайтесь на канал CLOUD.RU»; two QR codes
  // take the left one's, the pack's «QR_код_3» being a near copy of both): the block at 0.48-0.64 s, intro 2.2 s;
  // outro 1.6 s
  inPart('SFX_PodcastQR1In', 'SFX_PodcastQR1', 0.85, 2.84, 'Подкаст: QR-код 1', 'Podcast QR 1'),
  outPart('SFX_PodcastQR1Out', 'SFX_PodcastQR1', 6.78, 8.68, 'Подкаст: QR-код 1', 'Podcast QR 1'),
  inPart('SFX_PodcastQR2In', 'SFX_PodcastQR2', 0.85, 2.68, 'Подкаст: QR-код 2', 'Podcast QR 2'),
  outPart('SFX_PodcastQR2Out', 'SFX_PodcastQR2', 6.82, 8.72, 'Подкаст: QR-код 2', 'Podcast QR 2'),
  inPart('SFX_PodcastSubscribeIn', 'SFX_PodcastSubscribe', 0.85, 2.72, 'Подкаст: подписывайтесь на канал', 'Podcast Subscribe'),
  outPart('SFX_PodcastSubscribeOut', 'SFX_PodcastSubscribe', 6.97, 8.87, 'Подкаст: подписывайтесь на канал', 'Podcast Subscribe'),
  // POD_Frame: the punch of its fly-in (the master keeps the pack's time), and of its fly-out (the master 0.32 s
  // later than the pack: the part ends with the template, 0.04 s after the pack's track would)
  part('SFX_PodcastFrameIn', 'SFX_PodcastTextPlate1', 0, 0.95, { in: 0, out: 0.15 }, 'Подкаст: рамка — появление', 'Podcast Frame In'),
  part('SFX_PodcastFrameOut', 'SFX_PodcastTextPlate1', 8.72, 9.64, { in: 0.03, out: 0 }, 'Подкаст: рамка — уход', 'Podcast Frame Out'),
];

const r6 = (v) => Math.round(v * 1e6) / 1e6;

// ffmpeg filters from the parent's library file to the part: cut, fades, 16 bits with dither (the fades are new samples).
export function partFilters(p) {
  const len = r6(p.end - p.start);
  const f = [`atrim=start=${p.start}:end=${p.end}`, 'asetpts=PTS-STARTPTS'];
  if (p.fade.in > 0) f.push(`afade=t=in:d=${p.fade.in}`);
  if (p.fade.out > 0) f.push(`afade=t=out:st=${r6(len - p.fade.out)}:d=${p.fade.out}`);
  f.push('aresample=osf=s16:dither_method=triangular');
  return f.join(',');
}

// A part as a sound of the manifest: its parent's group, its own title and keywords.
export function partSound(p, parent) {
  return { id: p.id, title_ru: p.title_ru, group: parent.group, keywords: p.keywords, sec: r6(p.end - p.start) };
}
