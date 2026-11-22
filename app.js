const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = "https://dtmenhmjnuvjjpjcgxrn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0bWVuaG1qbnV2ampwamNneHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMjY2NDAsImV4cCI6MjExMDkwMjY0MH0.LaoFvLMzHEg2gwj2BqzcHFZM3M-OYEw7XFjvlumlPBc";
const ROOT = __dirname;
const TABLES = {
  customers: {
    fields: ["name", "phone", "email", "address"],
    required: ["name", "phone"],
    max: { name: 120, phone: 30, email: 254, address: 500 },
    text: ["name", "phone", "email", "address"]
  },
  vehicles: {
    fields: ["customer_id", "brand", "model", "license_plate", "year", "color", "transmission"],
    required: ["customer_id", "brand", "model", "license_plate"],
    max: { brand: 60, model: 80, license_plate: 20, color: 40, transmission: 30 },
    text: ["brand", "model", "license_plate", "color", "transmission"],
    number: { year: [1950, new Date().getFullYear() + 1] }
  },
  work_orders: {
    fields: ["customer_id", "vehicle_id", "complaint", "status", "estimated_cost"],
    required: ["customer_id", "vehicle_id", "complaint"],
    max: { complaint: 2000 },
    text: ["complaint"],
    number: { estimated_cost: [0, 999999999999.99] },
    enums: { status: ["Menunggu", "Dalam proses", "Siap diambil", "Selesai", "Dibatalkan"] }
  }
};
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(Object.assign(new Error("Ukuran data terlalu besar (maksimal 1 MB)."), { status: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(Object.assign(new Error("Format JSON tidak valid."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function validateData(table, input, isUpdate) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Object.assign(new Error("Data harus berupa objek JSON."), { status: 400 });
  const config = TABLES[table];
  const data = {};
  for (const [key, rawValue] of Object.entries(input)) {
    if (!config.fields.includes(key)) throw Object.assign(new Error(`Kolom "${key}" tidak diizinkan.`), { status: 400 });
    if (rawValue === null && ["email", "address", "year", "color", "transmission"].includes(key)) {
      data[key] = null;
      continue;
    }
    if (config.text?.includes(key)) {
      if (typeof rawValue !== "string") throw Object.assign(new Error(`Kolom "${key}" harus berupa teks.`), { status: 400 });
      const value = rawValue.trim();
      if (config.required.includes(key) && !value) throw Object.assign(new Error(`Kolom "${key}" wajib diisi.`), { status: 400 });
      if (value.length > config.max[key]) throw Object.assign(new Error(`Kolom "${key}" maksimal ${config.max[key]} karakter.`), { status: 400 });
      data[key] = value || (key === "email" || key === "address" ? null : value);
      continue;
    }
    if (config.number?.[key]) {
      if (rawValue === "" || rawValue === null) {
        if (key === "year") { data[key] = null; continue; }
        throw Object.assign(new Error(`Kolom "${key}" harus berupa angka.`), { status: 400 });
      }
      const value = Number(rawValue);
      const [min, max] = config.number[key];
      if (!Number.isFinite(value) || value < min || value > max) throw Object.assign(new Error(`Nilai "${key}" harus antara ${min} dan ${max}.`), { status: 400 });
      data[key] = value;
      continue;
    }
    if (config.enums?.[key]) {
      if (!config.enums[key].includes(rawValue)) throw Object.assign(new Error(`Nilai "${key}" tidak valid.`), { status: 400 });
      data[key] = rawValue;
      continue;
    }
    if (["customer_id", "vehicle_id"].includes(key)) {
      if (typeof rawValue !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawValue)) {
        throw Object.assign(new Error(`Kolom "${key}" harus berisi ID yang valid.`), { status: 400 });
      }
      data[key] = rawValue;
      continue;
    }
    data[key] = rawValue;
  }
  if (Object.keys(data).length === 0) throw Object.assign(new Error("Tidak ada data untuk disimpan."), { status: 400 });
  if (!isUpdate) {
    const missing = config.required.filter((key) => data[key] === undefined || data[key] === null || data[key] === "");
    if (missing.length) throw Object.assign(new Error(`Kolom wajib diisi: ${missing.join(", ")}.`), { status: 400 });
  }
  return data;
}

function supabaseErrorMessage(payload, status) {
  const message = payload?.message || payload?.details || payload?.hint;
  if (status === 409 || payload?.code === "23505") return "Data dengan informasi tersebut sudah terdaftar.";
  if (payload?.code === "23503") return "Data masih digunakan oleh work order atau kendaraan lain. Hapus data terkait terlebih dahulu.";
  if (payload?.code === "23514" || payload?.code === "22P02") return "Data tidak valid. Periksa kembali isian yang dimasukkan.";
  return message || `Supabase mengembalikan kesalahan (${status}).`;
}

async function proxyApi(request, response, url) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return sendJson(response, 503, { error: "Konfigurasi Supabase belum tersedia. Atur SUPABASE_URL dan SUPABASE_ANON_KEY, lalu mulai ulang server." });
  }
  const table = url.pathname.slice("/api/".length);
  if (!Object.hasOwn(TABLES, table)) return sendJson(response, 404, { error: "Endpoint API tidak ditemukan." });
  const method = request.method;
  if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
    response.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return sendJson(response, 405, { error: "Metode tidak diizinkan." });
  }
  if (method === "PATCH" || method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return sendJson(response, 400, { error: "ID yang valid wajib disertakan." });
    }
  }
  if (method === "GET" && url.searchParams.has("select")) {
    const select = url.searchParams.get("select");
    if (table !== "work_orders" || select !== "*,customers(id,name,phone),vehicles(id,brand,model,license_plate)") {
      return sendJson(response, 400, { error: "Permintaan relasi tidak valid." });
    }
  }
  let body;
  if (method === "POST" || method === "PATCH") {
    try {
      body = validateData(table, await readBody(request), method === "PATCH");
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }
  const query = new URLSearchParams();
  if (method === "PATCH" || method === "DELETE") query.set("id", `eq.${url.searchParams.get("id")}`);
  if (method === "GET" && url.searchParams.has("select")) {
    query.set("select", url.searchParams.get("select"));
    query.set("order", "created_at.desc");
  } else if (method === "GET" && table === "work_orders") {
    query.set("select", "*,customers(id,name,phone),vehicles(id,brand,model,license_plate)");
    query.set("order", "created_at.desc");
  } else if (method === "GET") {
    query.set("select", "*");
    query.set("order", "created_at.desc");
  }
  try {
    const result = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: method === "GET" ? "return=representation" : "return=representation"
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const responseText = await result.text();
    let data = null;
    if (responseText) {
      try { data = JSON.parse(responseText); }
      catch { data = { message: "Respons dari Supabase tidak dapat dibaca." }; }
    }
    if (!result.ok) return sendJson(response, result.status, { error: supabaseErrorMessage(data, result.status) });
    return sendJson(response, result.status, data ?? []);
  } catch (error) {
    console.error("Supabase request failed:", error.message);
    return sendJson(response, 502, { error: "Tidak dapat menghubungi Supabase. Periksa koneksi dan URL proyek." });
  }
}

function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  let filePath;
  try {
    filePath = path.resolve(ROOT, `.${decodeURIComponent(requested)}`);
  } catch {
    return sendJson(response, 400, { error: "URL tidak valid." });
  }
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) return sendJson(response, 403, { error: "Akses ditolak." });
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) return sendJson(response, 404, { error: "Halaman tidak ditemukan." });
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST, PATCH, DELETE");
      return sendJson(response, 405, { error: "Metode tidak diizinkan." });
    }
    return proxyApi(request, response, url);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return sendJson(response, 405, { error: "Metode tidak diizinkan." });
  }
  return serveStatic(response, url.pathname);
});

server.listen(PORT, () => {
  console.log(`RodaKerja berjalan di http://localhost:${PORT}`);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) console.warn("Atur SUPABASE_URL dan SUPABASE_ANON_KEY sebelum melakukan operasi data.");
});
