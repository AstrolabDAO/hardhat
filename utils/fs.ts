import * as fs from "fs";

export function getLatestFileName(directory = "./", pattern: RegExp | string = "") {
  if (pattern && typeof pattern === "string")
    pattern = new RegExp(`^${pattern}`);
  const files = fs
    .readdirSync(directory)
    .filter((file) => (pattern ? (pattern as RegExp).test(file) : true))
    .sort(
      (a, b) =>
        parseInt(b.match(/(.+)-(\d+)(?:\..*)$/)?.[2] ?? "") -
        parseInt(a.match(/(.+)-(\d+)(?:\..*)$/)?.[2] ?? "")
    );

  if (files.length === 0) {
    console.warn(`No matching files found in ${directory}`);
    undefined;
  }
  return files[0];
}

export function getLatestFile(directory = "./", pattern: RegExp | string = "") {
  const filename = getLatestFileName(directory, pattern);
  if (!filename) throw new Error("No matching files found");
  return fs.readFileSync(`${directory}/${filename}`, "utf8");
}

export const loadJson = (filename: string): any | undefined => {
  try {
    return JSON.parse(fs.readFileSync(filename).toString());
  } catch (e) {
    console.log(`Error loading ${filename}: ${e}`);
  }
}

export const saveJson = (filename: string, data: any): boolean => {
  try {
    fs.writeFileSync(filename, typeof data == "string" ? data : JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.log(`Error saving ${filename}: ${e}`);
    return false;
  }
}

export const loadLatestJson = (
  directory: string,
  pattern: RegExp | string = ""
): any | undefined => JSON.parse(getLatestFile(directory, pattern));
