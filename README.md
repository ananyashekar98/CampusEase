# CampusEase

**Smart Classroom Booking, Timetable Management and Faculty Locator**

CampusEase is a campus management application developed by Ananya, Department of Information Science and Engineering, as a final-year project. It brings classroom scheduling, room booking, timetable viewing and faculty location information into one platform, for students, faculty and administrators.

## Features

- **Timetable Management:** Displays timetables for departments, semesters and sections. Students see their section's timetable, and faculty see their assigned classes. Timetables can be downloaded as a PDF.
- **Auto Allocator:** Assigns suitable classrooms to existing timetable entries inside each department's own rooms. Supports full-week, single-day and custom-date-range allocation, with a preview and conflict validation before anything is published. Date-range allocations use date-specific overrides instead of changing the recurring weekly timetable.
- **Classroom Booking:** Faculty can request classrooms, and administrators can approve or reject requests. Administrators can also create direct bookings for additional classes, including after-hours extra classes. Rooms and faculty cannot be double-booked, and past dates and Sundays are blocked.
- **Faculty Locator:** Shows where a faculty member is, including staffroom or cabin location, current class and availability.
- **Classroom Map and Staffroom Locations:** Helps users find classrooms and staffrooms across the campus.
- **Notifications:** Alerts for room changes, booking decisions and extra classes, with a dedicated Extra Classes filter.
- **Bulk Import and AI Assistant:** The main admin can import users from a spreadsheet, and admins can create bookings from a plain-language request.

## Roles and access

| Role | What they can do |
| --- | --- |
| Main admin | Manage every department: allocate rooms, approve bookings, view all timetables, bulk import |
| Department admin | The same tools, limited to their own department's rooms, faculty and students |
| Faculty | View their timetable, request rooms, track their bookings, find other faculty |
| Student | View their section's timetable, receive extra-class notifications, find staffrooms |

## Tech stack

- **Frontend:** React Native (Expo SDK 51), running as a web app
- **Backend:** Node.js, Express, Mongoose, JWT authentication
- **Database:** MongoDB Atlas
- **Hosting (free tier):** Render for the API and the web app

## Project structure

```
backend/    Express API: controllers, models, routes, room allocation engine, maintenance scripts
frontend/   Expo app: screens, components, API client
```

## Getting started

You need Node.js 18 or newer and a MongoDB database (local or Atlas).

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
# set EXPO_PUBLIC_API_URL, or edit the fallback in src/api/client.js,
# to your backend address, e.g. http://<your-computer-IP>:5000/api
npx expo start --web
```

Open http://localhost:8081, or http://<your-computer-IP>:8081 on a phone on the same Wi-Fi.

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

Student USNs follow the format `1GA` + batch year + department + number, for example `1GA23IS016`.

## Deployment

The API runs as a Render web service (root directory `backend`, start command `npm start`) and the web app as a Render static site (root directory `frontend`, build command `npm install && npx expo export -p web`, publish directory `dist`). Set `MONGO_URI` and `JWT_SECRET` on the API service, and `EXPO_PUBLIC_API_URL` on the static site. MongoDB Atlas must allow connections from Render.

## Known limitations

- On Render's free tier the API sleeps after 15 minutes of inactivity, so the first request after a break can take about a minute.
- Profile photos are stored on the server's disk, which is cleared on every restart on the free tier.
- The booking and allocation locks work inside a single server process.
- Push notifications and password-reset emails need extra configuration (SMTP and device tokens) and are not set up in the demo.

## Security notes

- Never commit `.env`. Use `.env.example` as the template.
- The default passwords above are for demo data only. Change them for real use.

## Author

Ananya, Department of Information Science and Engineering.
