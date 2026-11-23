# Discussions App

Web app for admin-provisioned employee discussions (works on laptop and mobile browsers).

## Important: what link to share

`http://localhost:5173` only works on **your** computer.  
To let other employees open it on **any laptop or phone**, deploy once, then share the **public HTTPS URL** (for example `https://task-manager-xxxx.onrender.com`).

### Deploy on Render (recommended)

1. Open [https://dashboard.render.com](https://dashboard.render.com) and sign in (GitHub login is fine).
2. **New +** → **Blueprint** → connect `kavita-srivastava85/task-manager`.
3. Apply the included `render.yaml` (free web service).
4. After deploy finishes, open the service and copy its URL, like:
   - `https://task-manager.onrender.com`  
     (exact subdomain is shown on your Render dashboard)
5. Share **that URL** with employees for web and mobile.

Notes:
- Free Render apps may sleep after idle time; the first open can take ~30–60 seconds.
- SQLite data on free hosting can reset if the service is rebuilt — keep employee passwords written down.

## Local development (your machine only)

```bash
cd task-manager
cp server/.env.example server/.env
npm run install:all
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173
```

Open **http://localhost:5173** locally.

### How to use

1. **Admin console** → **Sign up** (first time).
2. Create employee logins and share email + password.
3. Employees use **Employee console** on the same public URL.
4. Discussions are shared across admin and employees.
