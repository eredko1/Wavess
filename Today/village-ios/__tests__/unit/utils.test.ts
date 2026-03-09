// Pure utility functions extracted from the app for isolated unit testing

function ageLabel(months: number | null): string {
  if (!months) return "—";
  if (months < 24) return `${months}mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y}yr ${m}mo` : `${y}yr`;
}

function getNextWeekend(): { sat: string; sun: string } {
  const today = new Date();
  const day = today.getDay();
  const daysToSat = day === 6 ? 0 : 6 - day;
  const sat = new Date(today);
  sat.setDate(today.getDate() + daysToSat);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return {
    sat: sat.toISOString().slice(0, 10),
    sun: sun.toISOString().slice(0, 10),
  };
}

function formatEventDate(isoString: string): string {
  const d = new Date(isoString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, tomorrow)) return "Tomorrow";

  const diffMs = d.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0 && diffDays <= 6) return `In ${diffDays} days`;

  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("ageLabel", () => {
  it("returns — for null", () => {
    expect(ageLabel(null)).toBe("—");
  });
  it("returns — for 0", () => {
    expect(ageLabel(0)).toBe("—");
  });
  it("returns months only for under 24 months", () => {
    expect(ageLabel(9)).toBe("9mo");
    expect(ageLabel(23)).toBe("23mo");
  });
  it("returns years only when no remainder months", () => {
    expect(ageLabel(24)).toBe("2yr");
    expect(ageLabel(60)).toBe("5yr");
    expect(ageLabel(120)).toBe("10yr");
  });
  it("returns years and months when there is a remainder", () => {
    expect(ageLabel(25)).toBe("2yr 1mo");
    expect(ageLabel(67)).toBe("5yr 7mo");
  });
});

describe("getNextWeekend", () => {
  it("returns sat before sun", () => {
    const { sat, sun } = getNextWeekend();
    const satDate = new Date(sat + "T12:00:00Z");
    const sunDate = new Date(sun + "T12:00:00Z");
    expect(sunDate.getTime() - satDate.getTime()).toBe(86400 * 1000);
  });

  it("sun is exactly 1 day after sat", () => {
    const { sat, sun } = getNextWeekend();
    // Parse at noon UTC to avoid DST/timezone edge cases
    const satMs = new Date(sat + "T12:00:00Z").getTime();
    const sunMs = new Date(sun + "T12:00:00Z").getTime();
    expect(sunMs - satMs).toBe(86400 * 1000);
  });

  it("returns dates in YYYY-MM-DD format", () => {
    const { sat, sun } = getNextWeekend();
    expect(sat).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sun).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatEventDate", () => {
  it("returns Today for current date", () => {
    const today = new Date().toISOString();
    expect(formatEventDate(today)).toBe("Today");
  });

  it("returns Tomorrow for next day", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(formatEventDate(tomorrow.toISOString())).toBe("Tomorrow");
  });

  it("returns In N days for near future", () => {
    const future = new Date();
    future.setDate(future.getDate() + 4);
    expect(formatEventDate(future.toISOString())).toBe("In 4 days");
  });
});
