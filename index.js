const express = require('express');
const app = express();
const cors = require("cors");
const dotenv = require('dotenv');
const http = require('http'); // Add this
const socketIO = require('socket.io'); // Add this
const {Message} = require('./models/models'); // Create this model
dotenv.config();

// Create HTTP server
const server = http.createServer(app); // Add this

// Initialize Socket.IO
const io = socketIO(server, { // Add this
    cors: {
        origin: "*", // Replace with your frontend URL
        methods: ["GET", "POST"]
    }
});

app.use(express.json());
app.use(cors());
const dbConnect = require('./db/db')

// Import routes
const superAdminRoute = require('./routes/superAdmin');
const adminRoute = require('./routes/admin')
const TLroutes = require('./routes/teamLeader')
const employeeRoutes = require('./routes/employee');
const seedSuperAdmin = require('./db/seedSuperAdmin');
const clientRoutes = require('./routes/client')
const taskRoutes = require('./routes/task');
const notificationRoutes = require('./routes/notification');
const chatRoutes = require('./routes/chat'); // Add this - create this file
const { restartCronJobs } = require('./controllers/task');

// Store connected users
const connectedUsers = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle user connection
    socket.on('user_connected', (userData) => {
        connectedUsers.set(userData.userId, socket.id);
        console.log('User connected:', userData.userId);
    });

    // Handle private messages
    socket.on('private_message', async (data) => {
        try {
            // Save message to database (implement this in your message controller)
            const message = new Message({
                sender: data.senderId,
                senderType: data.senderType,
                receiver: data.receiverId,
                receiverType: data.receiverType,
                content: data.content
            });
            await message.save();

            // Send message to receiver if online
            const receiverSocketId = connectedUsers.get(data.receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('receive_message', message);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    });

    // Handle typing status
    socket.on('typing', (data) => {
        const receiverSocketId = connectedUsers.get(data.receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_typing', {
                senderId: data.senderId,
                typing: data.typing
            });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        for (const [userId, socketId] of connectedUsers.entries()) {
            if (socketId === socket.id) {
                connectedUsers.delete(userId);
                console.log('User disconnected:', userId);
                break;
            }
        }
    });
});

// Routes
app.get('/', (req, res) => {
    res.send("You have landed on the test page");
});

app.use('/superAdmin', superAdminRoute);
app.use('/admin', adminRoute);
app.use('/teamLeader', TLroutes); 
app.use('/employee', employeeRoutes);
app.use('/client', clientRoutes);
app.use('/task', taskRoutes);
app.use('/notification', notificationRoutes);
app.use('/chat', chatRoutes); // Add chat routes

restartCronJobs();
seedSuperAdmin();

// Change app.listen to server.listen
server.listen(3000, () => {
    console.log(`Server listening at PORT -> ${3000}`);
});

dbConnect();

// Export io instance to use in other files if needed
module.exports = { io };