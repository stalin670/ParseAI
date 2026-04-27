import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "@/lib/api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test";
});

describe("apiFetch", () => {
  it("attaches Authorization header from token getter", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await apiFetch("/docs", { tokenGetter: async () => "abc" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get("Authorization")).toBe("Bearer abc");
  });

  it("throws on non-2xx with detail message", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "nope" }), { status: 400 }),
    );
    await expect(
      apiFetch("/docs", { tokenGetter: async () => "abc" }),
    ).rejects.toThrow("nope");
  });
});
