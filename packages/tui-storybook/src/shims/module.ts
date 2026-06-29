export const builtinModules: string[] = [];

export const createRequire = () => {
  const unavailableRequire = () => {
    throw new Error(
      "[tui-storybook] module.createRequire is not available in the browser preview",
    );
  };
  return Object.assign(unavailableRequire, {
    resolve: unavailableRequire,
  });
};

export default { builtinModules, createRequire };
