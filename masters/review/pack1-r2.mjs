// Second review of the first pack (after the user's notes of 2026-10-05): only what changed, plus the new
// speed and text-size controls. Rendered by tools/masters/review.mjs --review pack1-r2.
const PACK = { TXT_NAME: 'Александр Стародубцев', TXT_ROLE1: 'Технический лидер', TXT_ROLE2: 'Cloud.ru' };
const WEB = { TXT_NAME: 'Александр Константинов', TXT_ROLE1: 'Технический эксперт', TXT_ROLE2: 'по облачным технологиям' };
const TT = 'CR_TTL_LowerThird_16x9_v1';

export const renders = {
  LOGO_Shot: [
    { name: 'ls_dark_light', comp: 'CR_LOGO_Shot_16x9_v1', ctrl: { Caption: 2, Theme: 2, Background: 3 } },
    { name: 'ls_dark_dark', comp: 'CR_LOGO_Shot_16x9_v1', ctrl: { Caption: 2, Theme: 2, Background: 2 } },
  ],
  LOGO_Mark: [
    { name: 'lm_v_plain', comp: 'CR_LOGO_Mark_9x16_v1', ctrl: { Plate: 0, Theme: 2, Background: 1 } },
    { name: 'lm_v_plate', comp: 'CR_LOGO_Mark_9x16_v1', ctrl: { Plate: 1, Theme: 2, Background: 1 } },
  ],
  TTL_LowerThird: [
    { name: 'tt_webinar', comp: TT, ctrl: { Style: 3, Side: 1 }, text: WEB },
    { name: 'tt_podcast', comp: TT, ctrl: { Style: 2, Side: 2 }, text: PACK },
    { name: 'tt_podcast_guest', comp: TT, ctrl: { Style: 2, Side: 1 },
      text: { TXT_NAME: 'Анна-Мария Ёлкина', TXT_ROLE1: 'Руководитель облачной платформы', TXT_ROLE2: 'Cloud.ru' } },
    { name: 'tt_titles', comp: TT, ctrl: { Style: 1, Side: 1, Speed: 2, Size: 2 }, text: PACK },
    { name: 'tt_titles_s075', comp: TT, ctrl: { Style: 1, Side: 1, Speed: 1, Size: 2 }, text: PACK },
    { name: 'tt_titles_s2', comp: TT, ctrl: { Style: 1, Side: 1, Speed: 5, Size: 2 }, text: PACK },
    { name: 'tt_titles_size80', comp: TT, ctrl: { Style: 1, Side: 1, Speed: 2, Size: 1 }, text: PACK },
    { name: 'tt_titles_size160', comp: TT, ctrl: { Style: 1, Side: 1, Speed: 2, Size: 5 }, text: PACK },
  ],
};

const g = (slug, comp, extra = {}) => ({ golden: `${slug}/${comp}`, ...extra });
const r = (name, extra = {}) => ({ render: name, ...extra });
const FHD = { w: 1920, h: 1080 };
const VERT = { w: 1080, h: 1920 };
const strip = (y, h) => ({ x: 0, y, w: 1920, h });

export const scenes = [
  {
    name: 'r2_logomark_out', duration: 4.2,
    title: '1 · Логотип без подписи: уход с подложкой',
    note: 'С подложкой: подложка схлопывается к центру и срезает логотип своими краями, без отдельного масштаба.\nБез подложки уход прежний: надпись уезжает за куб, куб схлопывается. Длина шаблона — 4 с.',
    noteAt: [60, 88],
    panels: [
      { src: g('logo', 'logoshoty_vertikalnyy_bez_sablayna_s_plashkoy'), frame: VERT, at: [120, 172], size: [480, 853], label: 'Оригинал с подложкой (ухода нет)', labelAt: [120, 1036] },
      { src: r('lm_v_plate'), frame: VERT, at: [720, 172], size: [480, 853], label: 'Новый, с подложкой', labelAt: [720, 1036] },
      { src: r('lm_v_plain'), frame: VERT, at: [1320, 172], size: [480, 853], label: 'Новый, без подложки', labelAt: [1320, 1036] },
    ],
  },
  {
    name: 'r2_webinar', duration: 3.0,
    title: '2 · «Вебинар»: подпись неподвижна, как в пакете',
    note: 'Без входа и ухода. «Скорость» на этот стиль не влияет, «Размер текста» — влияет.',
    noteAt: [60, 700],
    panels: [
      { src: g('webinars', 'zastavka_so_spikerom'), frame: FHD, crop: { x: 1040, y: 620, w: 600, h: 230 }, at: [80, 260], size: [840, 322],
        label: 'Оригинал — заставка вебинара', labelAt: [80, 210] },
      { src: r('tt_webinar'), frame: FHD, crop: { x: 60, y: 790, w: 600, h: 230 }, at: [1000, 260], size: [840, 322],
        label: 'Новый, стиль «Вебинар»', labelAt: [1000, 210] },
    ],
  },
  {
    name: 'r2_podcast_guest', duration: 6.0,
    title: '3 · «Подкаст»: гость слева — зеркало ведущего',
    note: 'Имя стоит у края рамки, должность — у другого края за отступом, где одинарная стрелка.\nВерхняя строка должности не заходит на двойную стрелку: плашка расширяется. «Титры» справа убраны.',
    noteAt: [60, 930],
    panels: [
      { src: r('tt_podcast'), frame: FHD, crop: strip(740, 320), at: [0, 180], size: [1920, 320],
        label: 'Ведущий, справа', labelAt: [60, 130] },
      { src: r('tt_podcast_guest'), frame: FHD, crop: strip(740, 320), at: [0, 590], size: [1920, 320],
        label: 'Гость, слева, длинная должность', labelAt: [60, 540] },
    ],
  },
  {
    name: 'r2_logoshot_contrast', duration: 5.2,
    title: '4 · Логошот: тёмная тема и фон',
    note: 'Тёмные плашки на тёмном фоне больше не получаются: при фоне «Тёмный» шаблон сам берёт светлые плашки.\nТёмная тема — для светлого фона и светлого видео.',
    panels: [
      { src: r('ls_dark_light'), frame: FHD, crop: strip(400, 280), at: [0, 190], size: [1920, 280],
        label: 'Тёмная тема, фон «Светлый»', labelAt: [60, 140] },
      { src: r('ls_dark_dark'), frame: FHD, crop: strip(400, 280), at: [0, 590], size: [1920, 280],
        label: 'Тёмная тема, фон «Тёмный» — плашки светлые', labelAt: [60, 540] },
    ],
  },
  {
    name: 'r2_speed', duration: 6.0,
    title: '5 · Новое: «Скорость» (0,75× · 1× · 1,25× · 1,5× · 2×)',
    note: 'Скорость меняет вход и уход; удержание тянется по длине клипа, длина задаётся в Premiere как обычно.',
    noteAt: [60, 1010],
    panels: [
      { src: r('tt_titles_s075'), frame: FHD, crop: strip(780, 250), at: [0, 150], size: [1920, 250], label: '0,75×', labelAt: [1700, 160] },
      { src: r('tt_titles'), frame: FHD, crop: strip(780, 250), at: [0, 440], size: [1920, 250], label: '1×', labelAt: [1700, 450] },
      { src: r('tt_titles_s2'), frame: FHD, crop: strip(780, 250), at: [0, 730], size: [1920, 250], label: '2×', labelAt: [1700, 740] },
    ],
  },
  {
    name: 'r2_size', duration: 4.0, start: 1.6,
    title: '6 · Новое: «Размер текста» (80–160 %), угол блока на месте',
    note: 'Размер меняется с привязкой к левому нижнему углу блока: отступы от края кадра не меняются.',
    noteAt: [60, 800],
    panels: [
      { src: r('tt_titles_size80'), frame: FHD, at: [30, 240], size: [600, 338], label: '80 %', labelAt: [30, 195], border: true },
      { src: r('tt_titles'), frame: FHD, at: [660, 240], size: [600, 338], label: '100 %', labelAt: [660, 195], border: true },
      { src: r('tt_titles_size160'), frame: FHD, at: [1290, 240], size: [600, 338], label: '160 %', labelAt: [1290, 195], border: true },
    ],
  },
];
