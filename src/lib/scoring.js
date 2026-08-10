// League scoring. Kept separate from the value model so the same projected
// stat line can be priced for any league — 0.5 PPR is the default here, not an
// assumption baked into the math.

export const DEFAULT_SCORING = {
  passYd: 0.04,   // 1 pt / 25 yards
  passTd: 4,
  passInt: -2,
  pass2pt: 2,
  rushYd: 0.1,
  rushTd: 6,
  rush2pt: 2,
  rec: 0.5,       // half PPR
  recYd: 0.1,
  recTd: 6,
  rec2pt: 2,
  fumLost: -2,
  tePremium: 0,   // extra points per TE reception
};

export const SCORING_PRESETS = {
  "0.5 PPR": { ...DEFAULT_SCORING },
  "Full PPR": { ...DEFAULT_SCORING, rec: 1 },
  "Standard": { ...DEFAULT_SCORING, rec: 0 },
  "TE premium": { ...DEFAULT_SCORING, tePremium: 0.5 },
};

const BOX_FIELDS = ["pass_yd", "pass_td", "rush_yd", "rush_td", "rec", "rec_yd", "rec_td"];

/** Fantasy points for a projected stat line under the given scoring.
 *
 *  Kickers and defenses come back with the source's own pre-scored total:
 *  the feeds don't expose enough of their component stats (field goals by
 *  distance, points-allowed bands) to re-score honestly, and they're $1
 *  roster filler anyway. Returns null when there's nothing to score. */
export function projectedPoints(player, scoring = DEFAULT_SCORING) {
  const s = player?.stats;
  if (!s) return null;

  const hasBoxScore = BOX_FIELDS.some((k) => typeof s[k] === "number");
  if (!hasBoxScore) {
    return typeof s.pts_half_ppr === "number" ? s.pts_half_ppr : null;
  }

  const n = (k) => s[k] || 0;
  let pts = 0;
  pts += n("pass_yd") * scoring.passYd;
  pts += n("pass_td") * scoring.passTd;
  pts += n("pass_int") * scoring.passInt;
  pts += n("pass_2pt") * scoring.pass2pt;
  pts += n("rush_yd") * scoring.rushYd;
  pts += n("rush_td") * scoring.rushTd;
  pts += n("rush_2pt") * scoring.rush2pt;
  pts += n("rec") * scoring.rec;
  pts += n("rec_yd") * scoring.recYd;
  pts += n("rec_td") * scoring.recTd;
  pts += n("rec_2pt") * scoring.rec2pt;
  pts += n("fum_lost") * scoring.fumLost;
  if (player.pos === "TE") pts += n("rec") * (scoring.tePremium || 0);
  return pts;
}
