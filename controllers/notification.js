const {Notification} = require('../models/models');

// Add notification
exports.addNotification = async (userId, userType, message, type = 'message', priority = 'low') => {
    try {
        const notificationData = {
            userId,
            userType,
            message,
            type,
            priority,
            status: 'unread',
            readAt: null
        };

        const notification = new Notification(notificationData);
        await notification.save();

        return notification;
    } catch (error) {
        console.error('Error adding notification:', error);
        throw error;
    }
};

// Get all notifications for a user
exports.getAllNotifications = async (req, res) => {
    try {
        const { userId } = req.body;

        const notifications = await Notification.find({ 
            userId 
        }).sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            count: notifications.length,
            data: notifications
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Mark single notification as read
exports.markRead = async (req, res) => {
    try {
        const { notificationId } = req.body;

        const notification = await Notification.findByIdAndUpdate(
            notificationId,
            {
                status: 'read',
                readAt: new Date()
            },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        res.status(200).json({
            success: true,
            data: notification
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Mark single notification as unread
exports.markUnread = async (req, res) => {
    try {
        const { notificationId } = req.body;

        const notification = await Notification.findByIdAndUpdate(
            notificationId,
            {
                status: 'unread',
                readAt: null
            },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        res.status(200).json({
            success: true,
            data: notification
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Mark all notifications as read for a user
exports.markAllRead = async (req, res) => {
    try {
        const { userId } = req.body;

        const result = await Notification.updateMany(
            { 
                userId,
                status: 'unread'
            },
            {
                status: 'read',
                readAt: new Date()
            }
        );

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} notifications marked as read`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Delete individual notification
exports.deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.body;

        const notification = await Notification.findByIdAndDelete(notificationId);

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Delete all notifications for a user
exports.deleteAllNotifications = async (req, res) => {
    try {
        const { userId } = req.body;

        const result = await Notification.deleteMany({
            userId
        });

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} notifications deleted successfully`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};