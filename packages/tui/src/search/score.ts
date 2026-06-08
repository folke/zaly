export type ScoreOptions = {
  filenameBonus?: boolean
  historyBonus?: boolean
}

const SCORE_MATCH = 16
const SCORE_GAP_START = -3
const SCORE_GAP_EXTENSION = -1

const BONUS_BOUNDARY = SCORE_MATCH / 2
const BONUS_NONWORD = SCORE_MATCH / 2
const BONUS_CAMEL_123 = BONUS_BOUNDARY - 1
const BONUS_CONSECUTIVE = -(SCORE_GAP_START + SCORE_GAP_EXTENSION)
const BONUS_FIRST_CHAR_MULTIPLIER = 2
const BONUS_NO_PATH_SEP = BONUS_BOUNDARY - 2

const CHAR_WHITE = 0
const CHAR_NONWORD = 1
const CHAR_DELIMITER = 2
const CHAR_LOWER = 3
const CHAR_UPPER = 4
const CHAR_LETTER = 5
const CHAR_NUMBER = 6

const PATH_SEPS = new Set(["/", "\\"])

const CHAR_CLASS = Array.from({ length: 256 }, (_, b) => {
  const ch = String.fromCharCode(b)
  if (/\s/.test(ch)) return CHAR_WHITE
  if (String.raw`/\,:;|`.includes(ch)) return CHAR_DELIMITER
  if (b >= 48 && b <= 57) return CHAR_NUMBER
  if (b >= 65 && b <= 90) return CHAR_UPPER
  if (b >= 97 && b <= 122) return CHAR_LOWER
  return CHAR_NONWORD
})

function charClass(str: string, pos: number): number {
  const code = str.charCodeAt(pos)
  return code <= 255 ? (CHAR_CLASS[code] ?? CHAR_NONWORD) : CHAR_LETTER
}

export class Score {
  readonly #opts: ScoreOptions
  readonly #bonusMatrix: number[][] = []
  readonly #bonusBoundaryWhite: number
  readonly #bonusBoundaryDelimiter: number

  #consecutive = 0
  #firstBonus = 0
  #prev: number | undefined
  #prevClass = CHAR_WHITE
  #score = 0
  #str = ""

  isFile = false

  constructor(opts: ScoreOptions = {}) {
    this.#opts = opts
    this.#bonusBoundaryWhite = opts.historyBonus ? BONUS_BOUNDARY : BONUS_BOUNDARY + 2
    this.#bonusBoundaryDelimiter = opts.historyBonus ? BONUS_BOUNDARY : BONUS_BOUNDARY + 1
    for (let prev = 0; prev <= 6; prev++) {
      this.#bonusMatrix[prev] = []
      for (let curr = 0; curr <= 6; curr++) {
        this.#bonusMatrix[prev][curr] = this.#computeBonus(prev, curr)
      }
    }
  }

  get score(): number {
    return this.#score
  }

  isLeftBoundary(str: string, pos: number): boolean {
    return pos === 0 || charClass(str, pos - 1) < CHAR_LOWER
  }

  isRightBoundary(str: string, pos: number): boolean {
    return pos === str.length - 1 || charClass(str, pos + 1) < CHAR_LOWER
  }

  init(str: string, first: number): void {
    this.#str = str
    this.#score = 0
    this.#consecutive = 0
    this.#prevClass = first > 0 ? charClass(str, first - 1) : CHAR_WHITE
    this.#prev = undefined
    this.#firstBonus = 0

    if (this.isFile && this.#opts.filenameBonus && !hasPathSepAfter(str, first)) {
      this.#score += BONUS_NO_PATH_SEP
    }
    this.update(first)
  }

  update(pos: number): void {
    const cls = charClass(this.#str, pos)
    const gap = this.#prev === undefined ? 0 : pos - this.#prev - 1
    let bonus = 0

    if (gap > 0) {
      this.#prevClass = charClass(this.#str, pos - 1)
      bonus = this.#bonusMatrix[this.#prevClass]?.[cls] ?? 0
      this.#score += SCORE_GAP_START + (gap - 1) * SCORE_GAP_EXTENSION
      this.#consecutive = 0
      this.#firstBonus = 0
    } else {
      bonus = this.#bonusMatrix[this.#prevClass]?.[cls] ?? 0
      if (this.#consecutive === 0) {
        this.#firstBonus = bonus
      } else {
        if (bonus >= BONUS_BOUNDARY && bonus > this.#firstBonus) this.#firstBonus = bonus
        bonus = Math.max(bonus, this.#firstBonus, BONUS_CONSECUTIVE)
      }
      this.#consecutive++
    }

    if (this.#prev === undefined) bonus *= BONUS_FIRST_CHAR_MULTIPLIER
    this.#score += SCORE_MATCH + bonus
    this.#prevClass = cls
    this.#prev = pos
  }

  get(str: string, from: number, to: number): number {
    this.init(str, from)
    for (let i = from + 1; i <= to; i++) this.update(i)
    return this.#score
  }

  #computeBonus(prev: number, curr: number): number {
    if (curr > CHAR_NONWORD) {
      if (prev === CHAR_WHITE) return this.#bonusBoundaryWhite
      if (prev === CHAR_DELIMITER) return this.#bonusBoundaryDelimiter
      if (prev === CHAR_NONWORD) return BONUS_BOUNDARY
    }
    if (
      (prev === CHAR_LOWER && curr === CHAR_UPPER) ||
      (prev !== CHAR_NUMBER && curr === CHAR_NUMBER)
    ) {
      return BONUS_CAMEL_123
    }
    if (curr === CHAR_NONWORD || curr === CHAR_DELIMITER) return BONUS_NONWORD
    if (curr === CHAR_WHITE) return BONUS_BOUNDARY + 2
    return 0
  }
}

function hasPathSepAfter(str: string, first: number): boolean {
  for (let i = first + 1; i < str.length; i++) if (PATH_SEPS.has(str[i])) return true
  return false
}
