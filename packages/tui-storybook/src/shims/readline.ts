export const createInterface = () => {
  throw new Error(
    "[tui-storybook] readline.createInterface is not available in the browser preview",
  );
};

export default { createInterface };
