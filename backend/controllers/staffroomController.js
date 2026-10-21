const Staffroom = require('../models/Staffroom');
const { getScopeDepartment, isAllowedDepartment } = require('../utils/scope');

// @route  GET /api/staffrooms
// @access Private
const listStaffrooms = async (req, res) => {
  try {
    const scope = getScopeDepartment(req.user);
    const filter = scope ? { department: scope } : {};
    const staffrooms = await Staffroom.find(filter).sort({ department: 1, roomLabel: 1 });
    return res.status(200).json({ staffrooms });
  } catch (err) {
    console.error('List staffrooms error:', err);
    return res.status(500).json({ message: 'Server error fetching staffrooms' });
  }
};

// @route  POST /api/staffrooms
// @access Private/Admin
const createStaffroom = async (req, res) => {
  try {
    let { department } = req.body;
    const { roomLabel, building, floor, notes } = req.body;
    const scope = getScopeDepartment(req.user);
    if (scope) department = scope;

    if (!department || !roomLabel) {
      return res.status(400).json({ message: 'department and roomLabel are required' });
    }
    const staffroom = await Staffroom.create({ department, roomLabel, building, floor, notes });
    return res.status(201).json({ staffroom });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Create staffroom error:', err);
    return res.status(500).json({ message: 'Server error creating staffroom' });
  }
};

// @route  DELETE /api/staffrooms/:id
// @access Private/Admin
const deleteStaffroom = async (req, res) => {
  try {
    const staffroom = await Staffroom.findById(req.params.id);
    if (!staffroom) {
      return res.status(404).json({ message: 'Staffroom not found' });
    }
    if (!isAllowedDepartment(req.user, staffroom.department)) {
      return res.status(403).json({ message: 'You can only manage your own department\'s staffrooms' });
    }
    await staffroom.deleteOne();
    return res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete staffroom error:', err);
    return res.status(500).json({ message: 'Server error deleting staffroom' });
  }
};

// @route  PUT /api/staffrooms/:id
// @access Private/Admin
const updateStaffroom = async (req, res) => {
  try {
    const staffroom = await Staffroom.findById(req.params.id);
    if (!staffroom) {
      return res.status(404).json({ message: 'Staffroom not found' });
    }
    if (!isAllowedDepartment(req.user, staffroom.department)) {
      return res.status(403).json({ message: 'You can only manage your own department\'s staffrooms' });
    }

    let { department } = req.body;
    const { roomLabel, building, floor, notes } = req.body;
    const scope = getScopeDepartment(req.user);
    if (scope) department = scope; // department-scoped admin can't move a staffroom to another department

    if (!department || !roomLabel) {
      return res.status(400).json({ message: 'department and roomLabel are required' });
    }
    if (!isAllowedDepartment(req.user, department)) {
      return res.status(403).json({ message: 'You can only move staffrooms within your own department' });
    }

    staffroom.department = department;
    staffroom.roomLabel = roomLabel;
    staffroom.building = building;
    staffroom.floor = floor;
    staffroom.notes = notes;
    await staffroom.save();

    return res.status(200).json({ staffroom });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Update staffroom error:', err);
    return res.status(500).json({ message: 'Server error updating staffroom' });
  }
};

module.exports = { listStaffrooms, createStaffroom, updateStaffroom, deleteStaffroom };
