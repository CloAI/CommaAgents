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

export default { dirname, join, resolve };
