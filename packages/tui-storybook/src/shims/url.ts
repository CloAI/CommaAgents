export const fileURLToPath = (url: URL | string) =>
  typeof url === "string" ? new URL(url).pathname : url.pathname;

export const pathToFileURL = (path: string) => new URL(`file://${path}`);

export default { fileURLToPath, pathToFileURL };
