const unavailable = (operation: string) => () => {
  throw new Error(
    `[tui-storybook] zlib.${operation} is not available in the browser preview`,
  );
};

export const gunzipSync = unavailable("gunzipSync");
export const gzipSync = unavailable("gzipSync");

export default { gunzipSync, gzipSync };
