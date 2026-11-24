# Discussions App

Web app for admin-provisioned employee discussions (works on laptop and mobile browsers).

## Important: what link to share

`http://localhost:5173` only works on **your** computer.  
To let other employees open it on **any laptop or phone**, deploy once, then share the **public HTTPS URL** (for example `https://task-manager-xxxx.onrender.com`).

### Deploy / redeploy on Render

Live URL: **https://task-manager.onrender.com**

1. Open [https://dashboard.render.com](https://dashboard.render.com) and sign in.
2. Open the **task-manager** web service.
3. If it says **Suspended**, click **Resume**.
4. Click **Manual Deploy** → **Deploy latest commit** (branch `main`).
5. Wait until status is **Live**, then open https://task-manager.onrender.com
6. Share that URL with employees for laptop and mobile.

First-time setup (only if the service does not exist yet):
1. **New +** → **Blueprint** → connect `kavita-srivastava85/task-manager`
2. Apply `render.yaml`

Notes:
- Code on GitHub `main` is what Render builds.
- Free Render apps may sleep when idle; first open can take ~30–60 seconds.
- On each boot the app ensures known admin/employee accounts exist with password `Laptop@123` (override with env `DEFAULT_USER_PASSWORD`).

### Logins (shared password)

Password for all of these: **Laptop@123**

| Role | Email |
| --- | --- |
| Admin | kavi.urpal@gmail.com |
| Employee | kavita.srivastava85@gmail.com |
| Employee | anshu@gmail.com |
| Employee | admin@invoquesttechnologies.com |
| Employee | rutuja_patil@invoquesttechnologies.com |
| Employee | aarushi_goel@invoquesttechnologies.com |
| Employee | ankit_agrawal@invoquesttechnologies.com |

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
