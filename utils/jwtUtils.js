const jwt = require('jsonwebtoken');
const JWT_SECRET = 'Aryan';  // Ensure this environment variable is set

// Function to generate a JWT token
const generateToken = (payload) => {
    try {
        return jwt.sign(payload, JWT_SECRET);
    } catch (error) {
        console.error("Error generating token:", error);
        throw new Error('Error generating token');
    }
};

// Function to verify a JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        console.error("Invalid or expired token:", error);
        throw new Error('Invalid or expired token');
    }
};

module.exports = {
    generateToken,
    verifyToken
};
