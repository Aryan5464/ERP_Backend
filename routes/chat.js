const express = require('express');
const router = express.Router();
const {Message} = require('../models/models');

// Get chat history between two users
router.get('/messages/:userId1/:userId2', async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { sender: req.params.userId1, receiver: req.params.userId2 },
                { sender: req.params.userId2, receiver: req.params.userId1 }
            ]
        })
        .sort({ createdAt: 1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching messages' });
    }
});

// Mark messages as read
router.put('/messages/read', async (req, res) => {
    try {
        const { senderId, receiverId } = req.body;
        await Message.updateMany(
            { sender: senderId, receiver: receiverId, read: false },
            { $set: { read: true } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error marking messages as read' });
    }
});

// Get unread message count
router.get('/messages/unread/:userId', async (req, res) => {
    try {
        const count = await Message.countDocuments({
            receiver: req.params.userId,
            read: false
        });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: 'Error getting unread count' });
    }
});

module.exports = router;