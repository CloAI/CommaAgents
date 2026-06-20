/** Browser-safe subset used by Ink's error overview. */
export const existsSync = () => false;

export const readFileSync = () => {
  throw new Error("node:fs is not available in the Storybook browser preview");
};

export const openSync = readFileSync;
export const appendFileSync = () => {};
export const mkdirSync = () => {};
export const writeFileSync = () => {};

export const constants = {
  O_EVTONLY: 0,
  O_NONBLOCK: 0,
};

export default {
  appendFileSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
};
