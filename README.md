# RodaKerja

Aplikasi work order bengkel sederhana dengan HTML, CSS, JavaScript, Node.js bawaan, dan Supabase Postgres. Tidak memerlukan `package.json` atau dependensi npm.

## Struktur

- `index.html`, `styles.css`, `script.js` — antarmuka web responsif dan interaksi CRUD.
- `app.js` — server HTTP Node.js dan API yang meneruskan operasi CRUD ke Supabase REST API.
- `schema.sql` — tiga entitas, relasi, indeks, validasi, dan kebijakan akses Supabase.

## Menjalankan aplikasi

1. Buat proyek Supabase, lalu buka **SQL Editor** dan jalankan seluruh isi `schema.sql`.
2. Salin **Project URL** dan **anon/public key** dari pengaturan API proyek Supabase.
3. Atur variabel lingkungan, lalu jalankan server dengan Node.js 18 atau lebih baru:

   **PowerShell**

   ```powershell
   $env:SUPABASE_URL = "https://your-project.supabase.co"
   $env:SUPABASE_ANON_KEY = "your-supabase-anon-key"
   node app.js
   ```

   **macOS / Linux**

   ```sh
   SUPABASE_URL="https://your-project.supabase.co" \
   SUPABASE_ANON_KEY="your-supabase-anon-key" \
   node app.js
   ```

4. Buka `http://localhost:3000`.

`PORT` dapat diatur untuk memilih port selain `3000`. Jangan pernah menaruh `service_role` key di browser atau membagikannya. Kebijakan pada `schema.sql` mengizinkan siapa pun yang memiliki anon key membaca dan mengubah seluruh data; ini memudahkan demo tanpa login. Sebelum dipublikasikan, ganti kebijakan demo tersebut dengan autentikasi Supabase dan kebijakan per pengguna/workshop.
