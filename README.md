# Discussions App

Web app for admin-provisioned employee discussions (works on laptop and mobile browsers).

## Keeping discussions when you redeploy

Render deletes the web service's local files on every redeploy, and a free web service also loses those files whenever it sleeps. The app used to keep accounts, discussions, replies, and uploads in a SQLite file on that disk, so a UI redeploy wiped them.

Set `DATABASE_URL` to a Render Postgres database and the same redeploy keeps the data. Uploaded files are stored in that database too. On your own computer, leave `DATABASE_URL` unset and the app keeps using a local SQLite file.

### One-time setup

1. Open the web service [task-manager](https://dashboard.render.com/web/srv-dbvuds7lk1mc73bt68t0) and note its **region**.
2. In the Render dashboard choose **New +** → **Postgres**. Pick the **same region** as the web service. Use a paid database plan if these discussions should be kept: a Free Postgres database expires 30 days after creation, and Render deletes it after a short grace period.
3. When the database is available, copy its **Internal Database URL**.
4. On the web service, open **Environment** and add:
   - Key: `DATABASE_URL`
   - Value: that Internal Database URL
5. Save. Render redeploys. Open https://task-manager-21jg.onrender.com/api/health and check that it says `"storage":"postgres"`.

Discussions created after that stay in place when you redeploy. Posts that are only in the old SQLite file are not copied across; copy anything you still need before the next deploy.

If this service is updated from the Blueprint in `render.yaml`, syncing that file creates `task-manager-db` and sets `DATABASE_URL`. That database is on the Free plan until you change it in the dashboard.

A paid web service can instead attach a persistent disk mounted at `/var/data` and set `DATA_DIR=/var/data`. Postgres is the option that works while the web service stays on the free plan.

## Important: what link to share

`http://localhost:5173` only works on **your** computer.  
To let other employees open it on **any laptop or phone**, deploy once, then share the **public HTTPS URL** (for example `https://task-manager-xxxx.onrender.com`).

### Deploy / redeploy on Render

Live URL: **https://task-manager-21jg.onrender.com**

1. Open [https://dashboard.render.com](https://dashboard.render.com) and sign in.
2. Open the **task-manager** web service.
3. If it says **Suspended**, click **Resume**.
4. Click **Manual Deploy** → **Deploy latest commit** (branch `main`).
5. Wait until status is **Live**, then open https://task-manager-21jg.onrender.com
6. Share that URL with employees for laptop and mobile.

First-time setup (only if the service does not exist yet):
1. **New +** → **Blueprint** → connect `kavita-srivastava85/task-manager`
2. Apply `render.yaml`

Notes:
- Code on GitHub `main` is what Render builds.
- Free Render apps may sleep when idle; first open can take ~30–60 seconds.
- Known accounts are created only when the database is empty, with password `Laptop@123` (override with env `DEFAULT_USER_PASSWORD`). A redeploy does not put deleted accounts back.

### Logins (first-boot seed)

On a brand-new empty database, these accounts are created with password **Laptop@123**. After that, the admin can delete any employee account (or all of them) on the **Employees** page and recreate it with a new password. Deleted accounts are not restored on restart.

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
