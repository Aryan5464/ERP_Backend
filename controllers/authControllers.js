// controllers/authController.js
const crypto = require('crypto');
const { hashPassword } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');
const sendEmail = require('../utils/emailService');
const { SuperAdmin, Admin, TeamLeader, Employee, Client } = require('../models/models');

// Map of user types to their corresponding models
const USER_MODELS = {
    'superadmin': SuperAdmin,
    'admin': Admin,
    'teamleader': TeamLeader,
    'employee': Employee,
    'client': Client
};

const forgotPassword = async (req, res) => {
    try {
        const { email, userType } = req.body;

        if (!email || !userType) {
            return res.status(400).json({
                message: 'Email and user type are required'
            });
        }

        // Get the appropriate model
        const Model = USER_MODELS[userType.toLowerCase()];
        if (!Model) {
            return res.status(400).json({
                message: 'Invalid user type'
            });
        }

        // Find user
        const user = await Model.findOne({ email });
        if (!user) {
            return res.status(404).json({
                message: 'No user found with this email'
            });
        }

        // Generate reset token
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false });

        // Create reset URL
        const resetURL = `$https://mab-erp.vercel.app/reset-password/${userType}/${resetToken}`;

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #333;">Password Reset Request</h1>
                <p>Hello ${user.name},</p>
                <p>You requested to reset your password. Click the button below to reset it:</p>
                <p>
                    <a href="${resetURL}" 
                       style="background-color: #4CAF50; 
                              color: white; 
                              padding: 12px 24px; 
                              text-decoration: none; 
                              border-radius: 5px; 
                              display: inline-block;
                              margin: 20px 0;">
                        Reset My Password
                    </a>
                </p>
                <p>If you didn't request this, please ignore this email.</p>
                <p>This link will expire in 20 minutes.</p>
                <p style="color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #0066cc;">${resetURL}</p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p>Best regards,<br>MabiconsERP Team</p>
            </div>
        `;

        try {
            await sendEmail({
                email: user.email,
                subject: 'Password Reset Request',
                htmlContent,
                name: user.name
            });

            res.status(200).json({
                status: 'success',
                message: 'Password reset instructions sent to email!'
            });
        } catch (err) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save({ validateBeforeSave: false });

            console.error('Email sending error:', err);
            return res.status(500).json({
                message: 'There was an error sending the email. Try again later!'
            });
        }
    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { password, token, userType } = req.body;

        if (!password) {
            return res.status(400).json({
                message: 'New password is required'
            });
        }

        // Get the appropriate model
        const Model = USER_MODELS[userType.toLowerCase()];
        if (!Model) {
            return res.status(400).json({
                message: 'Invalid user type'
            });
        }

        // Hash the token
        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Find user with valid token
        const user = await Model.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                message: 'Token is invalid or has expired'
            });
        }

        // Hash and update password
        const newHashedPassword = await hashPassword(password);
        user.password = newHashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        // Generate new login token
        const loginToken = generateToken({
            id: user._id,
            email: user.email,
            role: userType
        });

        res.status(200).json({
            message: 'Password reset successful',
            token: loginToken
        });

    } catch (error) {
        console.error('Error in reset password:', error);
        res.status(500).json({
            message: 'An error occurred while resetting password'
        });
    }
};


module.exports = {
    forgotPassword,
    resetPassword
};