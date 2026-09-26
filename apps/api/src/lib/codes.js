// A stable machine code derived from a label staff typed ("Bank Transfer"
// → "bank_transfer"), made unique against the codes already taken.
export function codeFromLabel(label, takenCodes) {
  const base =
    label
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "item";
  const taken = new Set(takenCodes);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}
