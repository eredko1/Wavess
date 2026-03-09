// Tests for the interest categories used in the Children tab and Loop tab

const CATEGORIES = [
  { key: "school",       label: "School",       emoji: "📚" },
  { key: "sports",       label: "Sports",        emoji: "⚽" },
  { key: "dance",        label: "Dance",         emoji: "💃" },
  { key: "arts",         label: "Arts & Crafts", emoji: "🎨" },
  { key: "library",      label: "Library",       emoji: "📖" },
  { key: "music",        label: "Music",         emoji: "🎵" },
  { key: "stem",         label: "STEM",          emoji: "🔬" },
  { key: "nature",       label: "Outdoors",      emoji: "🌿" },
  { key: "martial_arts", label: "Martial Arts",  emoji: "🥋" },
  { key: "swimming",     label: "Swimming",      emoji: "🏊" },
  { key: "theater",      label: "Theater",       emoji: "🎭" },
  { key: "community",    label: "Community",     emoji: "🏘️" },
  { key: "fitness",      label: "Fitness",       emoji: "🏃" },
];

function toggleInterest(current: Set<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

describe("CATEGORIES constant", () => {
  it("has 13 categories", () => {
    expect(CATEGORIES).toHaveLength(13);
  });

  it("every category has a key, label, and emoji", () => {
    for (const cat of CATEGORIES) {
      expect(typeof cat.key).toBe("string");
      expect(cat.key.length).toBeGreaterThan(0);
      expect(typeof cat.label).toBe("string");
      expect(cat.label.length).toBeGreaterThan(0);
      expect(typeof cat.emoji).toBe("string");
      expect(cat.emoji.length).toBeGreaterThan(0);
    }
  });

  it("all keys are unique", () => {
    const keys = CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keys match the server-side valid tags", () => {
    const serverValidTags = [
      "school", "sports", "dance", "arts", "library",
      "music", "stem", "nature", "martial_arts", "swimming",
      "theater", "community", "fitness",
    ];
    const clientKeys = CATEGORIES.map((c) => c.key).sort();
    expect(clientKeys).toEqual([...serverValidTags].sort());
  });
});

describe("toggleInterest", () => {
  it("adds an interest that is not selected", () => {
    const result = toggleInterest(new Set(["sports"]), "dance");
    expect(result.has("dance")).toBe(true);
    expect(result.has("sports")).toBe(true);
  });

  it("removes an interest that is already selected", () => {
    const result = toggleInterest(new Set(["sports", "dance"]), "sports");
    expect(result.has("sports")).toBe(false);
    expect(result.has("dance")).toBe(true);
  });

  it("does not mutate the original set", () => {
    const original = new Set(["sports"]);
    toggleInterest(original, "sports");
    expect(original.has("sports")).toBe(true);
  });

  it("starts empty and adds correctly", () => {
    const result = toggleInterest(new Set(), "school");
    expect(result.has("school")).toBe(true);
    expect(result.size).toBe(1);
  });
});
