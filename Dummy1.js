// server.js or app.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "http://your-frontend-domain.com", // Replace with your frontend URL
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Store active connections
const activeConnections = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected');

    // Handle user authentication/connection
    socket.on('authenticate', (userId) => {
        console.log(`User ${userId} authenticated`);
        activeConnections.set(userId, socket.id);
        socket.userId = userId;
        socket.join(userId); // Join a room specific to this user
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        if (socket.userId) {
            activeConnections.delete(socket.userId);
            console.log(`User ${socket.userId} disconnected`);
        }
    });
});

// Export io instance to be used in other files
module.exports = { io, activeConnections };