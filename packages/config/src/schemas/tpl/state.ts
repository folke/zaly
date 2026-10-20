import { Type } from "typebox"

export const schema = Type.Object(
  {
    inputHistory: Type.Optional(Type.Array(Type.String())),
    lastModel: Type.Optional(Type.String()),
  },
  {
    $schema: "http://json-schema.org/draft-07/schema#",
    additionalProperties: false,
  }
)
