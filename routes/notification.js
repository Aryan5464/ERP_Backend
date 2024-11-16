const express = require('express'); 
const { MarkNotificationAsRead } = require('../utils/notify');

const router = express.Router();

// Route to mark a notification as read
router.post('/mark-as-read', MarkNotificationAsRead);

module.exports = router;