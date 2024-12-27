// const { Notification } = require('../models/models'); // Import the Notification model

// // Function to add a notification
// const addNotification = async ({ recipientId, recipientType, title, message }) => {
//     try {
//         // Validate required fields
//         if (!recipientId || !recipientType || !title || !message) {
//             throw new Error('Recipient ID, recipient type, title, and message are required.');
//         }

//         // Create and save the new notification
//         const newNotification = new Notification({
//             recipient: recipientId,
//             recipientType,
//             title,
//             message
//         });

//         await newNotification.save();
//         console.log('Notification added successfully');
//         return newNotification;
//     } catch (error) {
//         console.error('Error adding notification:', error);
//         throw error;
//     }
// };

// const Notification = require('../models/notification'); // Import the Notification model

// // Function to mark a notification as read
// const markNotificationAsRead = async (req, res) => {
//     try {
//         const { notificationId } = req.body;

//         // Check if notificationId is provided
//         if (!notificationId) {
//             return res.status(400).json({ message: 'Notification ID is required.' });
//         }

//         // Find the notification by ID and update it
//         const notification = await Notification.findByIdAndUpdate(
//             notificationId,
//             { isRead: true, readAt: new Date() },
//             { new: true } // Return the updated document
//         );

//         // If the notification doesn't exist
//         if (!notification) {
//             return res.status(404).json({ message: 'Notification not found.' });
//         }

//         res.status(200).json({
//             message: 'Notification marked as read successfully.',
//             notification
//         });
//     } catch (error) {
//         console.error('Error marking notification as read:', error);
//         res.status(500).json({ message: 'Server error' });
//     }
// };

// // Function to mark a notification as read
// const MarkNotificationAsRead = async (req, res) => {
//     try {
//         const { notificationId } = req.body;

//         // Check if notificationId is provided
//         if (!notificationId) {
//             return res.status(400).json({ message: 'Notification ID is required.' });
//         }

//         // Find the notification by ID and update it
//         const notification = await Notification.findByIdAndUpdate(
//             notificationId,
//             { isRead: true, readAt: new Date() },
//             { new: true } // Return the updated document
//         );

//         // If the notification doesn't exist
//         if (!notification) {
//             return res.status(404).json({ message: 'Notification not found.' });
//         }

//         res.status(200).json({
//             message: 'Notification marked as read successfully.',
//             notification
//         });
//     } catch (error) {
//         console.error('Error marking notification as read:', error);
//         res.status(500).json({ message: 'Server error' });
//     }
// };



// module.exports = {
//     addNotification,
//     MarkNotificationAsRead
// };