const { verifyToken } = require("../utils/jwtUtils");

const verifyAuthToken = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];

        // Check if the authorization header is present
        if (!authHeader) {
            return res.status(401).json({ message: 'Authorization header is missing' });
        }

        // Extract the token from the header (usually "Bearer <token>")
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'Token is missing' });
        }

        // Verify the token
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }

        // Attach the decoded data to the request object (e.g., req.user)
        req.user = decoded;

        // Proceed to the next middleware or route handler
        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};

module.exports = verifyAuthToken;