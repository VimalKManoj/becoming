import { afterEach, describe, expect, it, vi } from "vitest";
import { emailVerificationRequired, resetMessage, sendEmail, verificationMessage } from "./email";

const url = "https://becoming.example.test/api/auth/verify-email?token=abc&callbackURL=%2Faccount";

describe("account emails", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("only skips email confirmation on a local deployment that asks for it", () => {
    expect(emailVerificationRequired({ SITE_URL: "http://localhost:3001" })).toBe(true);
    expect(emailVerificationRequired({ SITE_URL: "http://localhost:3001", SKIP_EMAIL_VERIFICATION: "true" })).toBe(false);
    expect(emailVerificationRequired({ SITE_URL: "https://becoming.example.test", SKIP_EMAIL_VERIFICATION: "true" })).toBe(true);
    expect(emailVerificationRequired({ SITE_URL: "http://localhost.evil.test", SKIP_EMAIL_VERIFICATION: "true" })).toBe(true);
    expect(emailVerificationRequired({ SITE_URL: "http://localhost:3001", SKIP_EMAIL_VERIFICATION: "yes" })).toBe(true);
  });

  it("greets by first name, carries the link and escapes what it shows", () => {
    const message = verificationMessage("Vimal K Manoj", url);
    expect(message.subject).toBe("Confirm your email for Becoming");
    expect(message.text).toContain("Hi Vimal, one step left");
    expect(message.text).toContain(url);
    expect(message.html).toContain("token=abc&amp;callbackURL");
    expect(verificationMessage("<b>x</b>", url).html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(resetMessage("", url).text).toMatch(/^Someone asked to reset/);
  });

  it("writes the link to the logs on a local deployment without a Resend key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SITE_URL", "http://localhost:3001");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendEmail("a@example.test", verificationMessage("A", url));
    expect(log.mock.calls[0][0]).toContain(url);
  });

  it("refuses to pretend anywhere else without a key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SITE_URL", "https://becoming.example.test");
    await expect(sendEmail("a@example.test", verificationMessage("A", url))).rejects.toThrow("RESEND_API_KEY");
  });

  it("sends through Resend, and reports a refusal", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Becoming <hello@example.test>");
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await sendEmail("a@example.test", resetMessage("A", url));
    const [address, init] = fetch.mock.calls[0];
    expect(address).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({ from: "Becoming <hello@example.test>", to: ["a@example.test"], subject: "Reset your Becoming password" });
    fetch.mockResolvedValueOnce(new Response("domain not verified", { status: 403 }));
    await expect(sendEmail("b@example.test", resetMessage("B", url))).rejects.toThrow("403");
  });
});
