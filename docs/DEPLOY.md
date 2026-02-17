# Deploy to Railway

## Backend API

Railway builds from **repo root**. The root `package.json` runs:

- **build:** `cd backend && npm ci && npm run build`
- **start:** `cd backend && node dist/index.js`

So you do **not** need to set Root Directory in Railway; Railpack will detect Node and use these scripts.

1. **New Project** → Add **Database** → **PostgreSQL**.
2. **Add service** → **GitHub** → select **Jackson-NOTION** (or linds).
3. **Variables** for the API service:
   - `DATABASE_URL` – from the PostgreSQL service (or paste connection string).
   - `JWT_SECRET` – long random string (e.g. 32+ chars).
   - `FRONTEND_URL` – your app origin (e.g. `https://your-app.web.app` or `http://localhost:8081` for dev).
4. Deploy. Railway runs `npm install` (root), `npm run build`, `npm start`.
5. **Migrations:** After first deploy, run once from your machine:
   ```bash
   cd backend
   DATABASE_URL="postgresql://..." npm run db:migrate
   ```
   Use the PostgreSQL URL from Railway’s PostgreSQL service variables.

## Push to both remotes

- **origin** = Jackson-NOTION (fetch and push).
- **linds** = linds repo (push only).

```bash
git push origin main
git push linds main
```
