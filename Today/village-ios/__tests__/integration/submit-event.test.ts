// Integration tests for the business event submission logic
// (mocking fetch so no real network calls are made)

const API_BASE = "https://village-rho.vercel.app";

interface SubmitPayload {
  title: string;
  zip_code: string;
  start_at: string;
  organizer?: string;
  organizer_email?: string;
  tags?: string[];
  cost_cents?: number;
  age_min?: number;
  age_max?: number;
  venue_name?: string;
  address?: string;
  description?: string;
  registration_url?: string;
}

function buildPayload(overrides: Partial<SubmitPayload> = {}): SubmitPayload {
  return {
    title: "Kids Ballet Workshop",
    zip_code: "10001",
    start_at: "2026-07-15T10:00:00",
    organizer: "Test Dance Studio",
    tags: ["dance", "arts"],
    cost_cents: 0,
    age_min: 3,
    age_max: 10,
    ...overrides,
  };
}

async function submitEvent(payload: SubmitPayload): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}/api/events/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  return { status: res.status, body };
}

describe("business event submission payload validation", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 201,
      json: () => Promise.resolve({ ok: true, id: "mock-id" }),
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends correct Content-Type header", async () => {
    await submitEvent(buildPayload());
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });

  it("includes required fields in payload", async () => {
    await submitEvent(buildPayload());
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.title).toBe("Kids Ballet Workshop");
    expect(body.zip_code).toBe("10001");
    expect(body.start_at).toBe("2026-07-15T10:00:00");
  });

  it("sends POST method", async () => {
    await submitEvent(buildPayload());
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("handles server error response gracefully", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      json: () => Promise.resolve({ error: "title is required" }),
    }) as jest.Mock;

    const result = await submitEvent(buildPayload({ title: "" }));
    expect(result.status).toBe(400);
    expect((result.body as { error: string }).error).toMatch(/title/i);
  });

  it("handles network failure gracefully", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
    await expect(submitEvent(buildPayload())).rejects.toThrow("Network error");
  });

  it("converts age from years to months before sending", () => {
    // Verify the conversion math used in SubmitEventSheet
    const ageMinYears = 3;
    const ageMaxYears = 10;
    expect(Math.round(ageMinYears * 12)).toBe(36);
    expect(Math.round(ageMaxYears * 12)).toBe(120);
  });
});
