const unavailable = async (operation: string): Promise<never> => {
  throw new Error(
    `[tui-storybook] fs/promises.${operation} is not available in the browser preview`,
  );
};

export const appendFile = () => unavailable("appendFile");
export const chmod = () => unavailable("chmod");
export const mkdir = () => unavailable("mkdir");
export const mkdtemp = () => unavailable("mkdtemp");
export const open = () => unavailable("open");
export const readdir = () => unavailable("readdir");
export const readFile = () => unavailable("readFile");
export const realpath = () => unavailable("realpath");
export const rename = () => unavailable("rename");
export const rm = () => unavailable("rm");
export const stat = () => unavailable("stat");
export const unlink = () => unavailable("unlink");
export const writeFile = () => unavailable("writeFile");

export default {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
};
