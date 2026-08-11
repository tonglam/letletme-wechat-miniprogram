export function getDifficultyClass(difficulty?: number): string {
  if (typeof difficulty !== "number" || !Number.isFinite(difficulty)) {
    return "difficulty-unknown";
  }

  if (difficulty <= 2) {
    return "difficulty-easy";
  }

  if (difficulty === 3) {
    return "difficulty-medium";
  }

  if (difficulty === 4) {
    return "difficulty-hard";
  }

  return "difficulty-very-hard";
}

export function formatPrice(value?: number): string {
  if (typeof value !== "number") {
    return "";
  }

  return `£${(value / 10).toFixed(1)}m`;
}

export function getChipName(chip?: string): string {
  const map: Record<string, string> = {
    wildcard: "WC",
    freehit: "FH",
    bboost: "BB",
    "3xc": "TC",
    manager: "MNG"
  };

  return chip ? map[chip] || chip : "";
}
