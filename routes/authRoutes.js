// routes/authRoutes.js
const express = require('express');
const { forgotPassword, resetPassword } = require('../controllers/authControllers');
const router = express.Router(); 

// Forgot password route
router.post('/forgot-password', forgotPassword);

// Reset password route
router.post('/reset-password', resetPassword);

module.exports = router;