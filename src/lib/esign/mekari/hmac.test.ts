import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildHmacHeaders } from "./hmac";

describe("buildHmacHeaders", () => {
  it("menghasilkan signature yang deterministik dengan date dan secret tetap", () => {
    const fixedDate = "Tue, 26 Mar 2024 05:15:58 GMT";
    const dummyClientId = "dummy-client-id";
    const dummySecret = "dummy-secret-xyz-123";
    const method = "GET";
    const pathWithQuery = "/v2/esign-hmac/v1/profile";

    // Hitung manual signature yang diharapkan
    const expectedRequestLine = "GET /v2/esign-hmac/v1/profile HTTP/1.1";
    const expectedPayload = `date: ${fixedDate}\n${expectedRequestLine}`;
    const expectedSignature = crypto
      .createHmac("sha256", dummySecret)
      .update(expectedPayload)
      .digest("base64");

    const headers = buildHmacHeaders(method, pathWithQuery, {
      date: fixedDate,
      clientId: dummyClientId,
      clientSecret: dummySecret,
    });

    assert.equal(headers.Date, fixedDate);
    assert.equal(
      headers.Authorization,
      `hmac username="${dummyClientId}", algorithm="hmac-sha256", headers="date request-line", signature="${expectedSignature}"`
    );
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers.Accept, "application/json");
  });

  it("mempertahankan query parameter dalam request-line", () => {
    const fixedDate = "Wed, 27 Mar 2024 10:00:00 GMT";
    const dummyClientId = "client-query-test";
    const dummySecret = "secret-query-test";
    const method = "POST";
    const pathWithQuery = "/v2/esign-hmac/v1/documents?status=completed&limit=20";

    const expectedRequestLine =
      "POST /v2/esign-hmac/v1/documents?status=completed&limit=20 HTTP/1.1";
    const expectedPayload = `date: ${fixedDate}\n${expectedRequestLine}`;
    const expectedSignature = crypto
      .createHmac("sha256", dummySecret)
      .update(expectedPayload)
      .digest("base64");

    const headers = buildHmacHeaders(method, pathWithQuery, {
      date: fixedDate,
      clientId: dummyClientId,
      clientSecret: dummySecret,
    });

    assert.equal(
      headers.Authorization,
      `hmac username="${dummyClientId}", algorithm="hmac-sha256", headers="date request-line", signature="${expectedSignature}"`
    );
  });

  it("melakukan normalisasi huruf kapital pada HTTP method", () => {
    const fixedDate = "Thu, 28 Mar 2024 12:00:00 GMT";
    const dummyClientId = "test-client";
    const dummySecret = "test-secret";

    const headersUpper = buildHmacHeaders("GET", "/v2/esign-hmac/v1/profile", {
      date: fixedDate,
      clientId: dummyClientId,
      clientSecret: dummySecret,
    });

    const headersLower = buildHmacHeaders("get", "/v2/esign-hmac/v1/profile", {
      date: fixedDate,
      clientId: dummyClientId,
      clientSecret: dummySecret,
    });

    assert.equal(headersLower.Authorization, headersUpper.Authorization);
  });

  it("melempar error jika clientId atau clientSecret tidak terdefinisi", () => {
    const origId = process.env.MEKARI_CLIENT_ID;
    const origSecret = process.env.MEKARI_CLIENT_SECRET;

    delete process.env.MEKARI_CLIENT_ID;
    delete process.env.MEKARI_CLIENT_SECRET;

    try {
      assert.throws(
        () => buildHmacHeaders("GET", "/v2/esign-hmac/v1/profile"),
        /MEKARI_CLIENT_ID atau MEKARI_CLIENT_SECRET belum dikonfigurasi/
      );
    } finally {
      if (origId) process.env.MEKARI_CLIENT_ID = origId;
      if (origSecret) process.env.MEKARI_CLIENT_SECRET = origSecret;
    }
  });
});
