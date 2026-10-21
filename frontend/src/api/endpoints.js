import api from './client';

// --- Classrooms ---
export const fetchClassrooms = async () => {
  const { data } = await api.get('/classrooms');
  return data.classrooms;
};

export const fetchClassroomOccupancy = async () => {
  const { data } = await api.get('/classrooms/occupancy');
  return data.classrooms;
};

export const fetchAvailableClassrooms = async ({ date, startTime, endTime }) => {
  const { data } = await api.get('/classrooms/available', { params: { date, startTime, endTime } });
  return data.classrooms;
};

export const createClassroom = async (payload) => {
  const { data } = await api.post('/classrooms', payload);
  return data.classroom;
};

export const deleteClassroom = async (id) => {
  await api.delete(`/classrooms/${id}`);
};

// --- Timetable ---
export const fetchTimetable = async (params = {}) => {
  const { data } = await api.get('/timetable', { params });
  return data.entries;
};

export const downloadTimetablePdf = async (params = {}) => {
  const response = await api.get('/timetable/pdf', { params, responseType: 'blob' });
  return response.data; // a Blob
};

export const createTimetableEntry = async (payload) => {
  const { data } = await api.post('/timetable', payload);
  return data.entry;
};

export const deleteTimetableEntry = async (id) => {
  await api.delete(`/timetable/${id}`);
};

// Admin-only: seed realistic Sem 5 timetable for ISE/CSE/ECE, sections A/B/C.
export const seedSemester5Timetable = async (replace = false) => {
  const { data } = await api.post('/timetable/seed-sem5', { replace });
  return data;
};

// --- Users ---
export const fetchUsersByRole = async (role) => {
  const { data } = await api.get('/users', { params: { role } });
  return data.users;
};

// Admin: search students/faculty (for the Profile Photos & IDs screen).
export const searchUsers = async ({ q = '', role = '' } = {}) => {
  const { data } = await api.get('/users/search', { params: { q, role } });
  return data.users;
};

// Admin: set a faculty/admin member's staff ID.
export const updateUserStaffId = async (userId, staffId) => {
  const { data } = await api.put(`/users/${userId}/staff-id`, { staffId });
  return data.user;
};

export const updateMyProfile = async (payload) => {
  const { data } = await api.put('/users/me/profile', payload);
  return data.user;
};

export const changePassword = async ({ currentPassword, newPassword }) => {
  const { data } = await api.put('/auth/change-password', {
    currentPassword,
    newPassword
  });
  return data;
};

// --- Bookings ---
export const createBooking = async (payload) => {
  const { data } = await api.post('/bookings', payload);
  return data.booking;
};

export const fetchMyBookings = async () => {
  const { data } = await api.get('/bookings/mine');
  return data.bookings;
};

export const fetchAllBookings = async (status) => {
  const { data } = await api.get('/bookings', { params: status ? { status } : {} });
  return data.bookings;
};

export const fetchApprovedBookings = async (params = {}) => {
  const { data } = await api.get('/bookings/approved', { params });
  return data.bookings;
};

export const approveBooking = async (id) => {
  const { data } = await api.put(`/bookings/${id}/approve`);
  return data.booking;
};

export const rejectBooking = async (id, note) => {
  const { data } = await api.put(`/bookings/${id}/reject`, { note });
  return data.booking;
};

export const cancelBooking = async (id) => {
  const { data } = await api.put(`/bookings/${id}/cancel`);
  return data.booking;
};

// Non-blocking check: does this faculty member already have a class/booking
// at this date/time? Returns null when they're free.
export const checkFacultyAvailability = async ({ facultyId, date, startTime, endTime }) => {
  const { data } = await api.get('/bookings/faculty-availability', {
    params: { facultyId, date, startTime, endTime },
  });
  return data.conflict;
};

// --- Subject Requirements (allocator input) ---
export const fetchSubjectRequirements = async () => {
  const { data } = await api.get('/subject-requirements');
  return data.requirements;
};

export const createSubjectRequirement = async (payload) => {
  const { data } = await api.post('/subject-requirements', payload);
  return data.requirement;
};

// Real subjects for that department+semester, read off the actual
// Timetable — not a free-typed list. roomType narrows it to just the
// subjects that have a lab session; section (once chosen) excludes
// whatever already has a requirement of this roomType for that exact
// department+semester+section, so the same thing can't be added twice.
export const fetchAvailableSubjects = async ({ department, semester, section, roomType }) => {
  const { data } = await api.get('/subject-requirements/available-subjects', {
    params: { department, semester, section, roomType },
  });
  return data.subjects;
};

export const updateSubjectRequirement = async (id, payload) => {
  const { data } = await api.put(`/subject-requirements/${id}`, payload);
  return data.requirement;
};

export const deleteSubjectRequirement = async (id) => {
  await api.delete(`/subject-requirements/${id}`);
};

// --- Auto-Allocator ---
export const runAutoAllocator = async (name) => {
  const { data } = await api.post('/allocations/run', name ? { name } : {});
  return data.allocation;
};

export const fetchAllocations = async () => {
  const { data } = await api.get('/allocations');
  return data.allocations;
};

export const fetchAllocationById = async (id) => {
  const { data } = await api.get(`/allocations/${id}`);
  return data.allocation;
};

export const applyAllocation = async (id) => {
  const { data } = await api.put(`/allocations/${id}/apply`);
  return data.allocation;
};

export const deleteAllocation = async (id) => {
  await api.delete(`/allocations/${id}`);
};

// --- AI Booking Assistant (Groq) ---
export const parseBookingRequest = async (message) => {
  const { data } = await api.post('/assistant/parse-booking', { message });
  return data;
};

// --- Staffrooms ---
export const fetchStaffrooms = async () => {
  const { data } = await api.get('/staffrooms');
  return data.staffrooms;
};

export const createStaffroom = async (payload) => {
  const { data } = await api.post('/staffrooms', payload);
  return data.staffroom;
};

export const updateStaffroom = async (id, payload) => {
  const { data } = await api.put(`/staffrooms/${id}`, payload);
  return data.staffroom;
};

export const deleteStaffroom = async (id) => {
  await api.delete(`/staffrooms/${id}`);
};

// --- Faculty Locator ---
export const fetchFacultyDirectory = async () => {
  const { data } = await api.get('/users/faculty-directory');
  return data.faculty;
};

export const updateMyStatus = async (payload) => {
  const { data } = await api.put('/users/me/status', payload);
  return data.user;
};

// --- Notifications ---
export const fetchMyNotifications = async () => {
  const { data } = await api.get('/notifications');
  return data.notifications;
};

export const fetchUnreadNotificationCount = async () => {
  const { data } = await api.get('/notifications/unread-count');
  return data.count;
};

export const markNotificationRead = async (id) => {
  const { data } = await api.put(`/notifications/${id}/read`);
  return data.notification;
};

export const markAllNotificationsRead = async () => {
  await api.put('/notifications/read-all');
};

export const updateMyPushToken = async (pushToken) => {
  await api.put('/users/me/push-token', { pushToken });
};

// Circulars feature removed entirely — createCircular/fetchCirculars are
// gone, and so is everything that called them (AdminPostCircularScreen,
// the old CircularsScreen, and the "Circulars" filter on Notifications).

// --- Forgot password (public) ---
export const requestPasswordReset = async (email) => {
  const { data } = await api.post('/auth/forgot-password', { email });
  return data;
};

export const resetPassword = async ({ email, code, newPassword }) => {
  const { data } = await api.post('/auth/reset-password', { email, code, newPassword });
  return data;
};

// --- Profile photos ---
// photoUrl is stored as a relative path under /uploads; build the full URL
// from the API origin (the base URL without its trailing /api).
export const getPhotoUrl = (photoUrl) => {
  if (!photoUrl) return null;
  if (/^https?:\/\//i.test(photoUrl) || photoUrl.startsWith('data:')) return photoUrl;
  const origin = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  return `${origin}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
};

export const uploadUserPhoto = async (userId, asset) => {
  const form = new FormData();
  const blob = await (await fetch(asset.uri)).blob();
  form.append('photo', blob, asset.fileName || 'photo.jpg');
  const { data } = await api.put(`/users/${userId}/photo`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.user || data;
};

// --- Bulk import (main admin only) ---
export const previewBulkImport = async ({ fileName, fileBase64 }) => {
  const { data } = await api.post('/users/bulk-import/preview', { fileName, fileBase64 }, { timeout: 120000 });
  return data;
};

export const commitBulkImport = async ({ fileName, fileBase64 }) => {
  const { data } = await api.post('/users/bulk-import', { fileName, fileBase64 }, { timeout: 300000 });
  return data;
};

export const downloadBulkImportTemplate = async () => {
  const res = await api.get('/users/bulk-import/template', { responseType: 'blob' });
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'campusease-users-template.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

// --- Auto Allocator (room allocation for the existing timetable) ---
export const fetchAllocatorOptions = async () => {
  const { data } = await api.get('/room-allocation/options');
  return data;
};

export const previewRoomAllocation = async (payload) => {
  const { data } = await api.post('/room-allocation/preview', payload, { timeout: 120000 });
  return data;
};

export const validateRoomChange = async (payload) => {
  const { data } = await api.post('/room-allocation/validate-change', payload, { timeout: 60000 });
  return data;
};

export const saveRoomAllocationDraft = async (payload) => {
  const { data } = await api.post('/room-allocation/drafts', payload, { timeout: 60000 });
  return data.draft;
};

export const fetchRoomAllocationDrafts = async () => {
  const { data } = await api.get('/room-allocation/drafts');
  return data.drafts;
};

export const fetchRoomAllocationDraft = async (id) => {
  const { data } = await api.get(`/room-allocation/drafts/${id}`, { timeout: 60000 });
  return data;
};

export const deleteRoomAllocationDraft = async (id) => {
  const { data } = await api.delete(`/room-allocation/drafts/${id}`);
  return data;
};

export const publishRoomAllocation = async (payload) => {
  const { data } = await api.post('/room-allocation/publish', payload, { timeout: 120000 });
  return data;
};