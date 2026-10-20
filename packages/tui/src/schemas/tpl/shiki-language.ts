import { bundledLanguagesInfo } from "shiki/langs"
import { Type } from "typebox"

const languages: string[] = []
for (const { id, aliases } of bundledLanguagesInfo) {
  languages.push(id)
  if (aliases) languages.push(...aliases)
}

export const schema = Type.String({
  $schema: "http://json-schema.org/draft-07/schema#",
  enum: languages.toSorted(),
})
