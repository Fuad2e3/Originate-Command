/* =========================================================================
   api.js — Originate Command API Router
   Exposes all REST endpoints and SSE stream under /api/*
   ========================================================================= */

'use strict';

const express = require('express');
const ctrl = require('../controllers/commandController');

const router = express.Router();

// Real-time Server-Sent Events stream
router.get('/events', ctrl.subscribeEvents);

// Presence: who is currently connected
router.get('/presence', ctrl.getPresence);

// System state snapshot & sync
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    pid: process.pid,
    port: parseInt(process.env.PORT || '7000', 10),
    timestamp: new Date().toISOString()
  });
});
router.get('/state', ctrl.getState);
router.post('/mutate', ctrl.mutateState);
router.post('/reset', ctrl.resetState);
router.get('/stats', ctrl.getStats);

// Todos (OM SRS 001 6.2)
router.get('/todos', ctrl.getTodos);
router.get('/todos/:id', ctrl.getTodoById);
router.post('/todos', ctrl.createTodo);
router.patch('/todos/:id', ctrl.updateTodo);
router.put('/todos/:id', ctrl.updateTodo);
router.delete('/todos/:id', ctrl.deleteTodo);

// Instructions (OM SRS 001 6.3)
router.get('/instructions', ctrl.getInstructions);
router.post('/instructions', ctrl.createInstruction);
router.patch('/instructions/:id', ctrl.updateInstruction);
router.put('/instructions/:id', ctrl.updateInstruction);
router.delete('/instructions/:id', ctrl.deleteInstruction);

// Comments (OM SRS 001 5.0)
router.post('/comments', ctrl.addComment);

// Authentication & Password Management (Database-only password storage)
router.post('/auth/login', ctrl.loginUser);
router.post('/auth/set-password', ctrl.setUserPassword);

// Invites (OM SRS 001 6.1)
router.post('/invites/issue', ctrl.issueInvite);
router.post('/invites/claim', ctrl.claimInvite);
router.post('/invites/send-email', ctrl.sendInviteEmailRoute);

// Master collections
router.get('/users', ctrl.getUsers);

// Departments (OM SRS 001 5.2)
router.get('/departments', ctrl.getDepartments);
router.post('/departments', ctrl.createDepartment);
router.put('/departments/:id', ctrl.updateDepartment);
router.patch('/departments/:id', ctrl.updateDepartment);
router.delete('/departments/:id', ctrl.deleteDepartment);

// Clients (OM SRS 001 5.1)
router.get('/clients', ctrl.getClients);
router.post('/clients', ctrl.createClient);
router.put('/clients/:id', ctrl.updateClient);
router.patch('/clients/:id', ctrl.updateClient);
router.delete('/clients/:id', ctrl.deleteClient);

// Groups & Channels (OM SRS 001 5.4)
router.get('/groups', ctrl.getGroups);
router.post('/groups', ctrl.createGroup);
router.put('/groups/:id', ctrl.updateGroup);
router.patch('/groups/:id', ctrl.updateGroup);
router.delete('/groups/:id', ctrl.deleteGroup);

// Policies & Foundation Rules (OM SRS 001 5.5)
router.get('/policies', ctrl.getPolicies);
router.post('/policies', ctrl.createPolicy);
router.put('/policies/:id', ctrl.updatePolicy);
router.patch('/policies/:id', ctrl.updatePolicy);
router.delete('/policies/:id', ctrl.deletePolicy);

// Tags
router.get('/tags', ctrl.getTags);
router.post('/tags', ctrl.createTag);
router.put('/tags/:id', ctrl.updateTag);
router.patch('/tags/:id', ctrl.updateTag);
router.delete('/tags/:id', ctrl.deleteTag);

// Attendance
router.get('/attendance', ctrl.getAttendance);
router.post('/attendance', ctrl.recordAttendance);

// Leaves
router.get('/leaves', ctrl.getLeaves);
router.post('/leaves', ctrl.createLeave);
router.put('/leaves/:id', ctrl.updateLeave);
router.patch('/leaves/:id', ctrl.updateLeave);

// System Logs & Notifications
router.get('/audit', ctrl.getAudit);
router.get('/notifications', ctrl.getNotifications);
router.post('/notifications/send-email', ctrl.sendNotificationEmailRoute);

module.exports = router;

