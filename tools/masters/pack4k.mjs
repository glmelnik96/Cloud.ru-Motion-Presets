// D24: the 4K loops and clips are an installer option, the pack «4k» (tools/installer/build.mjs puts their files in an
// archive of their own). A master delivered as files renders, for each 16:9 loop or clip, the same file from its 16:9
// 4K variant; stills and transitions are light and stay in every install at 4K.
export const PACK_4K = '4k';
export const VARIANT_4K = '16x9_4K';

// The files with the 4K twin of each 16:9 loop or clip after it: «16x9…» keys become «16x9_4K…».
export function with4k(files) {
  return files.flatMap((f) => (f.variant === '16x9' && (f.kind === 'loop' || f.kind === 'clip')
    ? [f, { ...f, key: f.key.replace(/^16x9/, VARIANT_4K), variant: VARIANT_4K, pack: PACK_4K }]
    : [f]));
}

// The library's aspect of a master variant: the 4K one is 16:9.
export const aspectOf = (variant) => (variant === VARIANT_4K ? '16x9' : variant);

// What a file's library variant carries of the pack.
export const packOf = (f) => (f.pack ? { pack: f.pack } : {});
