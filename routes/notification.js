const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification');

// Get all notifications for a user
router.post('/get-all', notificationController.getAllNotifications);

// Mark single notification as read
router.post('/mark-read', notificationController.markRead);

// Mark single notification as unread
router.post('/mark-unread', notificationController.markUnread);

// Mark all notifications as read for a user
router.post('/mark-all-read', notificationController.markAllRead);

// Delete individual notification
router.delete('/delete-one', notificationController.deleteNotification);

// Delete all notifications for a user
router.delete('/delete-all', notificationController.deleteAllNotifications);

module.exports = router;