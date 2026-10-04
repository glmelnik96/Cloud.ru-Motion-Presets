// Designer review of the first pack: original pack comps (golden previews) next to the new templates, one
// scene per question to decide. Rendered by tools/masters/review.mjs into C:/CRBK/work/review/.
// Frame coordinates: a panel's crop is taken in the source's frame (`frame`), after `place` puts the source
// there (scale, then pad into the frame at x, y).
const PACK = { TXT_NAME: 'Александр Стародубцев', TXT_ROLE1: 'Технический лидер', TXT_ROLE2: 'Cloud.ru' };
const WEB = { TXT_NAME: 'Александр Константинов', TXT_ROLE1: 'Технический эксперт', TXT_ROLE2: 'по облачным технологиям' };

export const renders = {
  LOGO_Shot: [
    { name: 'ls_egr', comp: 'CR_LOGO_Shot_16x9_v1', ctrl: { Caption: 3, Theme: 1, Background: 1 } },
    { name: 'ls_uo', comp: 'CR_LOGO_Shot_16x9_v1', ctrl: { Caption: 1, Theme: 1, Background: 3 } },
    { name: 'ls_dark', comp: 'CR_LOGO_Shot_16x9_v1', ctrl: { Caption: 2, Theme: 2, Background: 2 } },
    { name: 'ls_v_uo', comp: 'CR_LOGO_Shot_9x16_v1', ctrl: { Caption: 1, Theme: 2, Background: 1 } },
    { name: 'ls_v_egr', comp: 'CR_LOGO_Shot_9x16_v1', ctrl: { Caption: 3, Theme: 2, Background: 1 } },
  ],
  LOGO_Mark: [
    { name: 'lm_v_plain', comp: 'CR_LOGO_Mark_9x16_v1', ctrl: { Plate: 0, Theme: 2, Background: 1 } },
    { name: 'lm_v_plate', comp: 'CR_LOGO_Mark_9x16_v1', ctrl: { Plate: 1, Theme: 2, Background: 1 } },
  ],
  TTL_LowerThird: [
    { name: 'tt_titles', comp: 'CR_TTL_LowerThird_16x9_v1', ctrl: { Style: 1, Side: 1 }, text: PACK },
    { name: 'tt_podcast', comp: 'CR_TTL_LowerThird_16x9_v1', ctrl: { Style: 2, Side: 2 }, text: PACK },
    { name: 'tt_webinar', comp: 'CR_TTL_LowerThird_16x9_v1', ctrl: { Style: 3, Side: 1 }, text: WEB },
    { name: 'tt_titles_right', comp: 'CR_TTL_LowerThird_16x9_v1', ctrl: { Style: 1, Side: 2 },
      text: { TXT_NAME: 'Мария Иванова', TXT_ROLE1: 'Руководитель направления', TXT_ROLE2: '' } },
    { name: 'tt_podcast_guest', comp: 'CR_TTL_LowerThird_16x9_v1', ctrl: { Style: 2, Side: 1 },
      text: { TXT_NAME: 'Анна-Мария Ёлкина', TXT_ROLE1: 'Руководитель облачной платформы', TXT_ROLE2: 'Cloud.ru' } },
    { name: 'tt_webinar_right', comp: 'CR_TTL_LowerThird_16x9_v1', ctrl: { Style: 3, Side: 2 },
      text: { TXT_NAME: 'Пётр Смирнов', TXT_ROLE1: 'Архитектор решений', TXT_ROLE2: '' } },
  ],
};

const g = (slug, comp, extra = {}) => ({ golden: `${slug}/${comp}`, ...extra });
const r = (name, extra = {}) => ({ render: name, ...extra });
const FHD = { w: 1920, h: 1080 };
const VERT = { w: 1080, h: 1920 };
const strip = (y, h) => ({ x: 0, y, w: 1920, h });

export const scenes = [
  {
    name: 'logoshot_egr', duration: 5.2,
    title: '1 · Логошот 16:9 — «есть где развернуться»',
    note: 'Решить (D19): кривые взяты у «Умного облака» — сдвиг до 2,12 с; у этой копии в пакете — до 2,40 с.\nУдержание у шаблона длиннее: аутро начинается в 3,96 с (длина по умолчанию 5 с).',
    panels: [
      { src: g('logo', 'logoshot_est_gde_razvernutsya'), frame: FHD, crop: strip(400, 280), at: [0, 190], size: [1920, 280],
        label: 'Оригинал — пакет logo, «Логошот_Есть где развернуться»', labelAt: [60, 140] },
      { src: r('ls_egr'), frame: FHD, crop: strip(400, 280), at: [0, 590], size: [1920, 280],
        label: 'Новый шаблон LOGO_Shot — подпись 3, светлая тема, прозрачный фон', labelAt: [60, 540] },
    ],
  },
  {
    name: 'logoshot_uo', duration: 5.2,
    title: '2 · Логошот 16:9 — «облачные и ИИ-сервисы», фон #F2F2F2',
    note: 'Решить (D5, D22): текст дескриптора — как в пакетах; в брендбуке — «облачные сервисы и AI-технологии».\nВ оригинале между 2,1 и 3,3 с пропадает край плашки — дефект рендера пакета, в шаблоне его нет.',
    panels: [
      { src: g('logo', 'logoshot_umnoe_oblako'), frame: FHD, crop: strip(400, 280), at: [0, 190], size: [1920, 280],
        label: 'Оригинал — пакет logo, «Логошот_Умное облако»', labelAt: [60, 140] },
      { src: r('ls_uo'), frame: FHD, crop: strip(400, 280), at: [0, 590], size: [1920, 280],
        label: 'Новый шаблон — подпись 1, светлая тема, фон «Светлый»', labelAt: [60, 540] },
    ],
  },
  {
    name: 'logoshot_9x16', duration: 5.0,
    title: '3 · Логошот 9:16',
    note: 'Решить: тайминг 9:16 сведён к 16:9 — без паузы 0,4 с, подъём 1,00–2,12 с, схлопывание в последние 10 кадров.\nПеренос «есть где / развернуться» — новый (D5).',
    noteAt: [60, 88],
    panels: [
      { src: g('logo', 'logoshoty_vertikalnyy_umnoe_oblako'), frame: VERT, at: [120, 172], size: [480, 853], label: 'Оригинал', labelAt: [120, 1036] },
      { src: r('ls_v_uo'), frame: VERT, at: [720, 172], size: [480, 853], label: 'Новый — подпись 1', labelAt: [720, 1036] },
      { src: r('ls_v_egr'), frame: VERT, at: [1320, 172], size: [480, 853], label: 'Новый — подпись 3 (новый перенос)', labelAt: [1320, 1036] },
    ],
  },
  {
    name: 'logomark_9x16', duration: 3.8,
    title: '4 · Логотип без подписи 9:16',
    note: 'Решить: аутро «в точку» 3,0–3,6 с — новое и временное (в пакете аутро нет).\nДвижение — как в пакете. Надпись #F7F7F7 заменена на #FFFFFF (D1).',
    noteAt: [60, 960],
    panels: [
      { src: g('logo', 'logoshoty_vertikalnyy_bez_sablayna'), frame: VERT, at: [48, 150], size: [420, 747], label: 'Оригинал без подложки', labelAt: [48, 908] },
      { src: r('lm_v_plain'), frame: VERT, at: [516, 150], size: [420, 747], label: 'Новый, «Подложка» выкл.', labelAt: [516, 908] },
      { src: g('logo', 'logoshoty_vertikalnyy_bez_sablayna_s_plashkoy'), frame: VERT, at: [984, 150], size: [420, 747], label: 'Оригинал с подложкой', labelAt: [984, 908] },
      { src: r('lm_v_plate'), frame: VERT, at: [1452, 150], size: [420, 747], label: 'Новый, «Подложка» вкл.', labelAt: [1452, 908] },
    ],
  },
  {
    name: 'titles', duration: 6.0,
    title: '5 · Подпись спикера — «Титры»',
    note: 'Выход как в оригинале (D4); у шаблона он на 0,48 с позже — длина клипа 6 с.\nБелая кромка у шаблона резкая: в шаблонах нет motion blur (контракт C35).',
    panels: [
      { src: g('titles', 'podpis_spikerov', { place: { scale: [750, 250], pad: [1920, 1080, 75, 794] } }), frame: FHD, crop: strip(760, 290), at: [0, 190], size: [1920, 290],
        label: 'Оригинал — холст 1500×500 в масштабе 50 % (так собран шаблон)', labelAt: [60, 140] },
      { src: r('tt_titles'), frame: FHD, crop: strip(760, 290), at: [0, 600], size: [1920, 290],
        label: 'Новый шаблон TTL_LowerThird, стиль «Титры»', labelAt: [60, 550] },
    ],
  },
  {
    name: 'titles_scale', duration: 4.0, start: 1.6,
    title: '6 · Масштаб «Титров»: какой размер правильный?',
    note: 'Решить: в каком масштабе монтажёры ставили холст 1500×500 в FHD-секвенцию.\nОт ответа зависит размер «Титров» в шаблоне: сейчас имя 50 px.',
    noteAt: [60, 800],
    panels: [
      { src: g('titles', 'podpis_spikerov', { place: { scale: [1500, 500], crop: [1500, 420, 0, 0], pad: [1920, 1080, 50, 609] } }), frame: FHD, at: [20, 200], size: [930, 523],
        label: 'Если холст ставили на 100 %: имя 100 px', labelAt: [20, 150], border: true },
      { src: r('tt_titles'), frame: FHD, at: [970, 200], size: [930, 523],
        label: 'Новый шаблон: имя 50 px (холст считался 4K-разметкой)', labelAt: [970, 150], border: true },
    ],
  },
  {
    name: 'podcast_in', duration: 6.0,
    title: '7 · Подпись спикера — «Подкаст»: вход',
    note: 'Решить: плашка #F2F2F2 вместо #D3D3D3 (D1); имя — SB Sans Display Bold, в брендбуке у Display только Regular и Semibold (D15).\nВ пакете плашка выезжает после пролёта рамки (с 0,6 с), в шаблоне — сразу; рамку подкаста соберём отдельным шаблоном.',
    noteAt: [60, 930],
    panels: [
      { src: g('podcast', 'podpis_spikera_1'), frame: FHD, crop: strip(740, 320), at: [0, 180], size: [1920, 320],
        label: 'Оригинал — пакет подкаста (рамка с пролётом, плашка #D3D3D3)', labelAt: [60, 130] },
      { src: r('tt_podcast'), frame: FHD, crop: strip(740, 320), at: [0, 590], size: [1920, 320],
        label: 'Новый, стиль «Подкаст», справа (ведущий)', labelAt: [60, 540] },
    ],
  },
  {
    name: 'podcast_out', duration: 2.4,
    title: '8 · «Подкаст»: выход',
    note: 'Выход как в пакете: слова падают, плашка закрывается вниз.',
    noteAt: [60, 930],
    panels: [
      { src: g('podcast', 'podpis_spikera_1', { start: 7.6 }), frame: FHD, crop: strip(740, 320), at: [0, 180], size: [1920, 320],
        label: 'Оригинал, с 7,6 с', labelAt: [60, 130] },
      { src: r('tt_podcast', { start: 4.24 }), frame: FHD, crop: strip(740, 320), at: [0, 590], size: [1920, 320],
        label: 'Новый, с 4,24 с', labelAt: [60, 540] },
    ],
  },
  {
    name: 'webinar', duration: 6.0,
    title: '9 · Подпись спикера — «Вебинар»',
    note: 'Решить: в пакете подпись неподвижна. Движение — новое: как «Титры», строка за строкой.\nКаждая строка в своей плашке; запятую после имени ставит стиль.',
    noteAt: [60, 700],
    panels: [
      { src: g('webinars', 'zastavka_so_spikerom'), frame: FHD, crop: { x: 1040, y: 620, w: 600, h: 230 }, at: [80, 260], size: [840, 322],
        label: 'Оригинал — заставка вебинара', labelAt: [80, 210] },
      { src: r('tt_webinar'), frame: FHD, crop: { x: 60, y: 790, w: 600, h: 230 }, at: [1000, 260], size: [840, 322],
        label: 'Новый, стиль «Вебинар»', labelAt: [1000, 210] },
    ],
  },
  {
    name: 'variations', duration: 6.0,
    title: '10 · Новый шаблон: сторона, длина текста, тёмная тема',
    note: '',
    panels: [
      { src: r('tt_titles_right'), frame: FHD, at: [160, 120], size: [768, 432], label: '«Титры», справа, одна строка должности', labelAt: [176, 132], border: true },
      { src: r('tt_podcast_guest'), frame: FHD, at: [992, 120], size: [768, 432], label: '«Подкаст», слева (гость), длинное имя', labelAt: [1008, 132], border: true },
      { src: r('tt_webinar_right'), frame: FHD, at: [160, 610], size: [768, 432], label: '«Вебинар», справа', labelAt: [176, 622], border: true },
      { src: r('ls_dark'), frame: FHD, at: [992, 610], size: [768, 432], label: 'Логошот: «умное облако», тёмная тема', labelAt: [1008, 622], border: true },
    ],
  },
];
