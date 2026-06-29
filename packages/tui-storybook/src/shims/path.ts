const normalize = (path: string): string => {
  const absolute = path.startsWith("/");
  const parts: string[] = [];

  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }

  return `${absolute ? "/" : ""}${parts.join("/")}` || (absolute ? "/" : ".");
};

export const join = (...parts: string[]) => normalize(parts.join("/"));

export const sep = "/";

export const isAbsolute = (path: string) => path.startsWith("/");

export const dirname = (path: string) => {
  const normalized = normalize(path);
  const separator = normalized.lastIndexOf("/");
  if (separator < 0) return ".";
  return separator === 0 ? "/" : normalized.slice(0, separator);
};

export const resolve = (...parts: string[]) =>
  normalize(
    parts.some((part) => part.startsWith("/"))
      ? parts.join("/")
      : `/${parts.join("/")}`,
  );

export const basename = (path: string) => {
  const normalized = normalize(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
};

export const relative = (from: string, to: string) => {
  const fromParts = resolve(from).split("/").filter(Boolean);
  const toParts = resolve(to).split("/").filter(Boolean);
  while (fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => ".."), ...toParts].join("/") || ".";
};

export default {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
};
