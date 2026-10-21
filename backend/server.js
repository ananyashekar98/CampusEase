require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const classroomRoutes = require('./routes/classroomRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const userRoutes = require('./routes/userRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const subjectRequirementRoutes = require('./routes/subjectRequirementRoutes');
const allocationRoutes = require('./routes/allocationRoutes');
const staffroomRoutes = require('./routes/staffroomRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const roomAllocationRoutes = require('./routes/roomAllocationRoutes');

const app = express();

// --- Core middleware ---
app.use(cors());
// 15mb so a spreadsheet (sent as base64) fits for bulk import.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// --- Uploaded profile photos (served at /uploads/photos/<file>) ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'campusease-backend' });
});

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/subject-requirements', subjectRequirementRoutes);
app.use('/api/allocations', allocationRoutes);
app.use('/api/staffrooms', staffroomRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/room-allocation', roomAllocationRoutes);

// Circulars feature removed entirely — no more model, controller, routes
// or route mounting for it. Delete routes/circularRoutes.js,
// controllers/circularController.js and models/Circular.js from the
// project; nothing else in the backend references them.

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`CampusEase backend running on port ${PORT}`);
  });
});