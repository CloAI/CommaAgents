/** Browser-safe subset used by Ink's error overview. */
export const existsSync = () => false;

export const readFileSync = () => {
  throw new Error("node:fs is not available in the Storybook browser preview");
};

export const openSync = readFileSync;
export const appendFileSync = () => {};
export const closeSync = () => {};
export const fsyncSync = () => {};
export const mkdirSync = () => {};
export const writeFileSync = () => {};
export const renameSync = () => {};
export const rmSync = () => {};
export const unlinkSync = () => {};
export const realpathSync = (path: string) => path;
export const readdirSync = () => [];
export const createWriteStream = readFileSync;

export const constants = {
  O_EVTONLY: 0,
  O_NONBLOCK: 0,
};

export default {
  appendFileSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  createWriteStream,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
};
