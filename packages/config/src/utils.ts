import { createDefu } from "defu"

/** Works like `defu` but replaces arrays instead of merging them. */
export const merge = createDefu((obj, key, value) => {
  if (Array.isArray(obj[key]) && Array.isArray(value)) {
    obj[key] = value
    return true
  }
})
