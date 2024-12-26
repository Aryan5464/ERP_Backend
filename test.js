const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Keep track of connected users
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle user login and save user ID with socket ID
  socket.on('login', (userId) => {
    onlineUsers.set(userId, socket.id);
    console.log(`${userId} logged in with socket ID ${socket.id}`);
  });

  // Handle private messages
  socket.on('privateMessage', ({ sender, recipient, message }) => {
    const recipientSocketId = onlineUsers.get(recipient);

    if (recipientSocketId) {
      io.to(recipientSocketId).emit('privateMessage', {
        sender,
        message,
      });
    } else {
      socket.emit('error', `User ${recipient} is offline or does not exist`);
    }
  });

  // Remove user from onlineUsers on disconnect
  socket.on('disconnect', () => {
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`${userId} disconnected`);
        break;
      }
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
