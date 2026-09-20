import {
  isAllowedFrontendOrigin,
  parseFrontendUrls,
} from "../config/frontendOrigins";

const configuredOrigins = [
  "https://app-one.vercel.app",
  "https://app-two.vercel.app",
  "https://app-three.vercel.app",
];

describe("frontend origin configuration", () => {
  it("parses comma-separated origins and trims whitespace", () => {
    expect(
      parseFrontendUrls(
        " https://one.example.com, , https://two.example.com ",
      ),
    ).toEqual(["https://one.example.com", "https://two.example.com"]);
  });

  it.each(configuredOrigins)("allows configured origin %s", (origin) => {
    expect(isAllowedFrontendOrigin(origin, configuredOrigins)).toBe(true);
  });

  it("rejects an unconfigured browser origin", () => {
    expect(
      isAllowedFrontendOrigin("https://unknown.example.com", configuredOrigins),
    ).toBe(false);
  });

  it("allows requests without an Origin header", () => {
    expect(isAllowedFrontendOrigin(undefined, configuredOrigins)).toBe(true);
  });

  it("rejects malformed frontend URL configuration", () => {
    expect(() => parseFrontendUrls("https://valid.example.com,not-a-url")).toThrow(
      "FRONTEND_URLS contains an invalid URL",
    );
  });

  it("rejects an empty frontend URL configuration", () => {
    expect(() => parseFrontendUrls(" , ")).toThrow(
      "FRONTEND_URLS must contain at least one origin",
    );
  });
});
