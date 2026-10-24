export function normalizeSocketId(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const str = value.toString?.();
    return typeof str === "string" ? str.trim() : "";
  }
  return String(value).trim();
}

export function getSocketRoomTargets(...values) {
  return values.map((value) => normalizeSocketId(value)).filter(Boolean);
}
