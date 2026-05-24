const request = require("supertest");
const app = require("../src/app");

jest.mock("../src/config/db", () => ({
  testConnection: jest.fn().mockResolvedValue(true),
  query: jest.fn(),
}));

describe("GET /health", () => {
  it("returns healthy status", async () => {
    const response = await request(app).get("/health");
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});
