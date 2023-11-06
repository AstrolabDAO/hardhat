import * as fs from "fs";

export function getLatestFileName(directory = "./", pattern: RegExp | string = "") {
  if (pattern && typeof pattern === "string")
    pattern = new RegExp(`^${pattern}`);
  const files = fs
    .readdirSync(directory)
    .filter((file) => (pattern ? (pattern as RegExp).test(file) : true))
    .sort(
      (a, b) =>
        parseInt(b.match(/\d+$/)?.[0] ?? "") -
        parseInt(a.match(/\d+$/)?.[0] ?? "")
    );

  if (files.length === 0) throw new Error("No matching files found");
  return files[0];
}

export function getLatestFile(directory = "./", pattern: RegExp | string = "") {
  const filename = getLatestFileName(directory, pattern);
  if (!filename) throw new Error("No matching files found");
  return fs.readFileSync(`${directory}/${filename}`, "utf8");
}

export const loadJson = (filename: string): any | undefined =>
  JSON.parse(fs.readFileSync(filename).toString());

export const loadLatestJson = (
  directory: string,
  pattern: RegExp | string = ""
): any | undefined => JSON.parse(getLatestFile(directory, pattern));
