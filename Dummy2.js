// components/NotificationHandler.jsx
import React, { useEffect, useState } from 'react';
import socketService from '../services/socketService';

const NotificationHandler = ({ userId }) => {
    const [notifications, setNotifications] = useState([]);

    useEffect(() => {
        // Connect to WebSocket when component mounts
        const socket = socketService.connect(userId);

        // Listen for notifications
        socket.on('notification', (notification) => {
            setNotifications(prev => [...prev, notification]);
            // You might want to show a toast notification here
            showNotificationToast(notification);
        });

        // Cleanup on unmount
        return () => {
            socketService.disconnect();
        };
    }, [userId]);

    const showNotificationToast = (notification) => {
        // Implement your toast notification logic here
        // Example using react-toastify:
        toast.info(notification.message, {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true
        });
    };

    return (
        <div className="notifications-container">
            {notifications.map((notification) => (
                <div key={notification._id} className="notification-item">
                    <p>{notification.message}</p>
                    <small>{new Date(notification.createdAt).toLocaleString()}</small>
                </div>
            ))}
        </div>
    );
};

export default NotificationHandler;