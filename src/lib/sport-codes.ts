/**
 * Two-letter codes for the event tiles. Each is unique and reads like the sport's name, so Basketball (BK) and
 * Badminton (BD) can't be confused. New sports fall back to their first two letters until they're given a code here.
 */
export const SPORT_CODES: Record<string, string> = {
  cricket: "CR", football: "FB", volleyball: "VB", basketball: "BK", throwball: "TB", badminton: "BD",
  "table-tennis": "TT", "lawn-tennis": "LT", pickleball: "PB", squash: "SQ", pool: "PL", carrom: "CM",
  foosball: "FS", chess: "CH", fifa: "FF", valorant: "VL", athletics: "AT",
  music: "MU", dance: "DA", "stage-play": "SK", "short-film": "SF", quiz: "QZ", "treasure-hunt": "TH",
  "roast-comedy": "RC", poetry: "PO", art: "AR",
};

export function sportCode(sportId: string): string {
  return SPORT_CODES[sportId] ?? sportId.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase();
}
