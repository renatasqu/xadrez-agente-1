import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { lessonCatalog } from "./lessonCatalog";

it("catálogo de apresentação reutiliza todas as lições editoriais do backend", () => {
  const curriculum = readFileSync("../backend/agents/licoes.py", "utf8");
  expect(lessonCatalog).toHaveLength((curriculum.match(/\bLicao\(/g) ?? []).length);
  for (const lesson of lessonCatalog) {
    for (const value of Object.values(lesson)) expect(curriculum).toContain(JSON.stringify(value));
  }
});
