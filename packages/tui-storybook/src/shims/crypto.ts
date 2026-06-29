const unavailable = (operation: string) => () => {
  throw new Error(
    `[tui-storybook] crypto.${operation} is not available in the browser preview`,
  );
};

export const randomBytes = unavailable("randomBytes");
export const createHash = unavailable("createHash");

export default { createHash, randomBytes };
