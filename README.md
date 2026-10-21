# CampusEase

Smart classroom booking, timetable and faculty locator for **Global Academy of Technology, Bengaluru**.

Built by Ananya, Dept. of Information Science and Engineering (final year project).

## What it does

- **Timetables** for every department, semester and section; students see their section, faculty see their classes.
- **Auto Allocator** assigns classrooms to the existing timetable (weekly, one day or a date range), with a preview and conflict checks before anything is published.
- **Classroom booking**: faculty request a room, admins approve or reject, admins can book directly (including after-hours extra classes). Rooms and faculty cannot be double-booked.
- **Notifications** for room changes, booking decisions and extra classes.
- **Roles**: main admin, department admins (limited to their own department), faculty and students.
- Classroom map, staffroom locations, bulk import and an AI booking assistant for admins.

## Tech stack

- Frontend: React Native (Expo SDK 51) running as a web app
- Backend: Node.js, Express, Mongoose, JWT authentication
- Database: MongoDB Atlas

## Run it locally

You need Node.js 18+ and a MongoDB database (local or Atlas).

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env        # on Windows: copy .env.example .env
# open .env and set MONGO_URI and JWT_SECRET
npm start                   # runs on http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
# in src/api/client.js set BASE_URL to http://<your-computer-IP>:5000/api
npx expo start --web
```

Open http://localhost:8081 (or http://<your-computer-IP>:8081 on a phone on the same Wi-Fi).

### 3. Sample data (optional)

```bash
cd backend
npm run seed
```

## Demo logins (sample data only)

| Role | Email | Password |
| --- | --- | --- |
| Main admin | admin@campusease.edu | Admin@123 |
| Faculty | `firstname.deptcode+staffid@campusease.edu`, e.g. nagesh.cse10001@campusease.edu | Faculty@123 |
| Student | `firstname.usn@campusease.edu`, e.g. aditya.1ga26cs001@campusease.edu | Student@123 |

Student USNs follow `1GA` + batch year + department + number, e.g. `1GA23IS016`.

## Safety notes

- Never commit `.env`. Use `.env.example` as the template.
- The default passwords above are for demo data only; change them for real use.
