# Academy Attendance — Deployment Guide

## What's built
- `backend/`  — Python FastAPI + AWS Rekognition integration
- `frontend/` — React PWA (installable on any phone, no app store)

---

## Step 1 — AWS setup (one-time, ~30 min)

### 1a. Create an AWS account
Go to https://aws.amazon.com and create a free account.

### 1b. Create an IAM user for the app
1. Go to IAM → Users → Create user
2. Name it `academy-attendance-app`
3. Attach these policies directly:
   - `AmazonRekognitionFullAccess`
   - `AmazonS3FullAccess`
4. Create an Access Key → save the key ID and secret

### 1c. Create an S3 bucket
1. Go to S3 → Create bucket
2. Name: `academy-attendance-photos` (or your choice)
3. Region: `ap-south-1` (Mumbai — closest to Sri Lanka)
4. Block all public access: ✅ ON

### 1d. The Rekognition collection is created automatically on first run.

---

## Step 2 — Deploy backend (Railway)

1. Go to https://railway.app → New project → Deploy from GitHub
2. Push this repo to GitHub first
3. Set root directory to `backend/`
4. Add all environment variables from `.env.example`:

```
DATABASE_URL          = (Railway gives you this when you add PostgreSQL)
AWS_ACCESS_KEY_ID     = (from Step 1b)
AWS_SECRET_ACCESS_KEY = (from Step 1b)
AWS_REGION            = ap-south-1
AWS_S3_BUCKET         = academy-attendance-photos
AWS_REKOGNITION_COLLECTION = academy-students
JWT_SECRET            = (generate: python -c "import secrets; print(secrets.token_hex(32))")
JWT_EXPIRE_HOURS      = 12
RATE_LIMIT_PER_MINUTE = 10
RATE_LIMIT_PER_SESSION = 60
REKOGNITION_MONTHLY_HARD_LIMIT = 5000
REKOGNITION_MONTHLY_SOFT_LIMIT = 4000
SCAN_COOLDOWN_SECONDS = 3
ENVIRONMENT           = production
ALLOWED_ORIGINS       = https://your-app.vercel.app
```

5. Add a PostgreSQL database in Railway → copy the DATABASE_URL
6. Run the schema: connect to DB and paste the contents of `backend/schema.sql`

---

## Step 3 — Deploy frontend (Vercel)

1. Go to https://vercel.com → New project → import your GitHub repo
2. Set root directory to `frontend/`
3. Add environment variable:
   - `VITE_API_URL` = your Railway backend URL
4. Deploy — Vercel gives you a URL like `https://academy-attendance.vercel.app`
5. Update `ALLOWED_ORIGINS` in Railway with this URL

---

## Step 4 — Create your first admin coach

Connect to your PostgreSQL database and run:

```sql
-- Replace values below
INSERT INTO coaches (name, email, pin_hash, role)
VALUES (
  'Head Coach',
  'coach@youracademy.com',
  -- Generate pin_hash in Python:
  -- from passlib.context import CryptContext
  -- print(CryptContext(schemes=["bcrypt"]).hash("123456"))
  '$2b$12$YOUR_BCRYPT_HASH_HERE',
  'admin'
);
```

Or run this helper script:
```bash
cd backend
python -c "
from passlib.context import CryptContext
pin = input('Enter PIN: ')
print(CryptContext(schemes=['bcrypt']).hash(pin))
"
```

---

## Step 5 — Register your 250 students

**Option A — Admin panel (coming in next phase)**
Use the web admin panel to add students one by one with camera photos.

**Option B — Bulk CSV import (fastest)**
Upload a CSV file:
```
name,age_group,position,jersey_number,is_regular
Jamal Mensah,U17,Striker,9,true
Carlos López,U17,Midfielder,8,true
```
Then call the bulk import endpoint:
```
POST /api/v1/admin/students/bulk-import
```

**Photo registration:**
For each student, use the admin panel to take 3 photos.
Best done at the start of one training session per age group.
Each photo upload → S3 + Rekognition IndexFaces automatically.

---

## Limits explained (all configurable in .env)

| Limit | Default | Purpose |
|---|---|---|
| `SCAN_COOLDOWN_SECONDS` | 3s | Prevents button-mashing |
| `RATE_LIMIT_PER_MINUTE` | 10 | Max scans per coach per minute |
| `RATE_LIMIT_PER_SESSION` | 60 | Max scans per session |
| `REKOGNITION_MONTHLY_SOFT_LIMIT` | 4000 | Admin warning triggered |
| `REKOGNITION_MONTHLY_HARD_LIMIT` | 5000 | API calls blocked |

For 250 students × 10 sessions/month × ~30 scans = ~300 API calls/month.
Hard limit of 5000 gives 16× headroom — no bill surprises.

---

## Going live checklist

- [ ] AWS IAM credentials added to Railway
- [ ] PostgreSQL schema applied
- [ ] First admin coach created
- [ ] Frontend deployed and ALLOWED_ORIGINS updated
- [ ] Test login on a real phone
- [ ] Verify camera works in phone browser (HTTPS required)
- [ ] Register 5 test students with photos
- [ ] Run one full test session
- [ ] Register all 250 students (1–2 days)
