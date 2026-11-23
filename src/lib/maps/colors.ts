/** Colour for a Google Maps rank on the geo-grid (shared by server and client). */
export function rankColor(rank: number | null) {
  if (rank === null) return "#94a3b8";
  if (rank <= 3) return "#16a34a";
  if (rank <= 7) return "#65a30d";
  if (rank <= 10) return "#d97706";
  return "#dc2626";
}
