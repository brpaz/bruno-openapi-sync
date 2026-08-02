import { promises as fs } from "node:fs";
import path from "node:path";
import { dump } from "js-yaml";

export async function writeYamlFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, dump(data, { noRefs: true, lineWidth: -1 }), "utf8");
}
