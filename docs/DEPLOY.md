# Deploy to Railway (from linds repo)

**Everything lives in the linds GitHub repo.** Railway pulls from linds for both the API and the web app. No local run required for production.

## 1. Backend API (first service)

Railway builds from **repo root**. The root `package.json` runs:

- **build:** `cd backend && npm ci && npm run build`
- **start:** `cd backend && node dist/index.js`

1. **New Project** → Add **Database** → **PostgreSQL**.
2. **Add service** → **GitHub** → select **linds**.
3. **Variables** for the API service:
   - `DATABASE_URL` – from the PostgreSQL service.
   - `JWT_SECRET` – long random string (e.g. 32+ chars).
   - `FRONTEND_URL` – set to your **web app** URL (see below). Use the web service domain once it exists (e.g. `https://linds-web-production-xxxx.up.railway.app`). For local dev only, `http://localhost:8081`.
4. **Networking** → Generate domain (port **8080** if Railway uses that).
5. **Migrations:** After first deploy, run once (from your machine or Railway CLI):
   ```bash
   cd backend
   DATABASE_URL="postgresql://..." npm run db:migrate
   ```

## 2. Web app (second service, from same linds repo)

Deploy the Expo web build as a second Railway service so the app is served from the same repo.

1. **Add service** → **GitHub** → select **linds** (same repo).
2. **Settings** → **Root Directory:** set to **`app`** (so this service builds only the app folder).
3. **Build command:** `npm ci && npm run build:web`  
   (produces static files in `dist/`. Do **not** use the default; otherwise `dist/` is missing and you get Metro/JSX errors.)
4. **Start command:** `npm start`  
   (in `app/` this runs `serve dist`, which serves the built files. Do **not** use `expo start` in production.)
5. **Variables:**
   - `EXPO_PUBLIC_API_URL` = your **API** URL (e.g. `https://linds-production-2547.up.railway.app`, no trailing slash).
6. **Networking** → Generate domain. Use the port Railway assigns (often 3000 for `serve`).
7. **API service:** Set `FRONTEND_URL` to this web app’s URL (e.g. `https://your-web-service.up.railway.app`) so CORS allows the browser.

After that, open the **web app** URL in Chrome; no local `npm run web` needed. Push to linds and both services redeploy.

## Push to both remotes

- **origin** = Jackson-NOTION (fetch and push).
- **linds** = linds repo (Railway pulls from here).

```bash
git push origin main
git push linds main
```
