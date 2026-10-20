import { bundledThemesInfo } from "shiki/themes"
import { Type } from "typebox"

export const schema = Type.String({
  $schema: "http://json-schema.org/draft-07/schema#",
  enum: bundledThemesInfo.map(({ id }) => id).toSorted(),
})
