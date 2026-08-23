# HMM sticker prototype

The app lives in `sticker-prototype` (Vite + React).

## Cursor Cloud specific instructions

The environment install runs `npm ci` in `sticker-prototype`. A Vite dev server should already be listening on port 5173.

- Open `http://127.0.0.1:5173` to use the prototype.
- Restart it with `npm --prefix sticker-prototype run dev -- --host 0.0.0.0 --port 5173`.
- Lint with `npm --prefix sticker-prototype run lint`.
- Typecheck and production build with `npm --prefix sticker-prototype run build`.
