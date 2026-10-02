// The nine projects of the package (spec §2): slug -> source .aep and its (Footage) folder, relative
// to the package root, in NFC. The courses Auto-Save copy is not a pack. Logo shots and titles have
// no footage files (their Collect reports list 0 files).
export const PACKS = {
  logo: { aep: '1_Логошоты/Логошот.aep', footage: null },
  logo_conv: { aep: '1_Логошоты/Логошот (converted).aep', footage: null },
  titles: { aep: '5_Titles/Titles (3).aep', footage: null },
  titles_conv: { aep: '5_Titles/Titles (3) (converted).aep', footage: null },
  webinars: { aep: '2_Вебинары/Вебинары.aep', footage: '2_Вебинары/(Footage)' },
  courses: {
    aep: '3_Обучающие_курсы/3_Обучающие курсы/Обучающие курсы.aep',
    footage: '3_Обучающие_курсы/3_Обучающие курсы/(Footage)',
  },
  courses_conv: {
    aep: '3_Обучающие_курсы/3_Обучающие курсы/Обучающие курсы (converted).aep',
    footage: '3_Обучающие_курсы/3_Обучающие курсы/(Footage)',
  },
  smm: { aep: '4_SMM_Pack/SMM_pack.aep', footage: '4_SMM_Pack/(Footage)' },
  podcast: { aep: '6_Podcast_Cloud.ru_Pack/Podcast_Pack.aep', footage: '6_Podcast_Cloud.ru_Pack/(Footage)' },
};
export const SLUGS = Object.keys(PACKS);

// Renames in the copies. The AI clip's ~250-character name puts its path at 322 characters, over
// the Windows MAX_PATH of 260 (audit_webinars, problem 0). Both clips are 1440x1440, 24 fps.
export const RENAMES = {
  webinars: [
    { match: /^A_robotic_arm_performing_minimal.*\.mp4$/i, to: 'AI_robot_arm_A_1440p24.mp4' },
    { match: /^Seedance\.mp4$/i, to: 'AI_robot_arm_B_1440p24.mp4' },
  ],
};

// Footage the package cannot provide: the converted courses file is a production job whose media
// sits on G:\ (audit_courses: 4 items, slide_01.png twice). Matched by NFC base name.
export const KNOWN_MISSING = {
  courses_conv: ['Запись экрана 2026-09-01 в 12.42.01.mov', '3D.png', 'slide_01.png'],
};
