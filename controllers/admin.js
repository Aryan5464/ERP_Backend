// controllers/adminController.js

const { Admin } = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');
const crypto = require('crypto');
const sendEmail = require('../utils/emailService');



// Function to create a new Admin
const createAdmin = async (req, res) => {
    try {
        const { name, email } = req.body;
        const defaultPassword = 'mabicons123'; // Default password

        // Check if all required fields are present
        if (!name || !email) {
            return res.status(400).json({ message: 'Name and email are required' });
        }

        // Check if the email is already taken by another Admin
        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        // Hash the default password before saving
        const hashedPassword = await hashPassword(defaultPassword);

        // Create the new Admin
        const admin = new Admin({
            name,
            email,
            password: hashedPassword
        });

        // Save the Admin to the database
        await admin.save();

        res.status(201).json({
            message: 'Admin created successfully',
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email
            }
        });
    } catch (error) {
        console.error('Error creating Admin:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if email and password are provided
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find the Admin by email
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Compare the provided password with the stored hashed password
        const isPasswordValid = await comparePasswords(password, admin.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate a JWT token
        const token = generateToken({ id: admin._id, email: admin.email, role: 'Admin' });

        res.status(200).json({
            message: 'Login successful',
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email
            }
        });
    } catch (error) {
        console.error('Error logging in Admin:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Function to edit an existing Admin
const editAdmin = async (req, res) => {
    try {
        const { adminId, name, password } = req.body; // Admin details

        // Check if the Admin ID is provided
        if (!adminId) {
            return res.status(400).json({ message: 'Admin ID is required' });
        }

        // Find the Admin by ID
        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Update Admin fields if they are provided
        if (name) admin.name = name;
        if (password) {
            // Hash the new password before saving
            admin.password = await hashPassword(password);
        }

        // Save the updated Admin
        await admin.save();

        res.status(200).json({
            message: 'Admin updated successfully',
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email
            }
        });
    } catch (error) {
        console.error('Error updating Admin:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const deleteAdmin = async (req, res) => {
    try {
        const { adminId } = req.body;

        if (!adminId) {
            return res.status(400).json({ message: 'Admin ID is required' });
        }

        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        await Admin.findByIdAndDelete(adminId);

        res.status(200).json({ message: 'Admin deleted successfully' });
    } catch (error) {
        console.error('Error deleting Admin:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Function to get the hierarchy from Admin -> TeamLeaders -> Employees
const getAdminHierarchy = async (req, res) => {
    try {
        const { adminId } = req.body; // Get adminId from request body

        // Check if adminId is provided
        if (!adminId) {
            return res.status(400).json({ message: 'Admin ID is required' });
        }

        // Find the admin by ID and populate their team leaders and their employees
        const adminHierarchy = await Admin.findById(adminId)
            .populate({
                path: 'teamLeaders', // Populate teamLeaders under admin
                populate: {
                    path: 'employees', // Populate employees under each team leader
                    select: 'name email' // Optional: Select specific fields of employees to return
                },
                select: 'name email' // Optional: Select specific fields of team leaders to return
            })
            .select('name email'); // Optional: Select specific fields of admin to return

        // Check if admin exists
        if (!adminHierarchy) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        res.status(200).json({
            message: 'Admin hierarchy retrieved successfully',
            adminHierarchy
        });
    } catch (error) {
        console.error('Error retrieving admin hierarchy:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const updateAdminPassword = async (req, res) => {
    try {
        const { adminId, newPassword } = req.body;

        // Validate inputs
        if (!adminId || !newPassword) {
            return res.status(400).json({ message: 'Admin ID and new password are required' });
        }

        // Validate admin existence
        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Hash the new password
        const hashedPassword = await hashPassword(newPassword);

        // Update the password in the database
        admin.password = hashedPassword;
        await admin.save();

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error updating admin password:', error);
        res.status(500).json({ message: 'Server error' });
    }
};



// controllers/admin.js
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(404).json({ message: 'No admin found with this email' });
        }

        const resetToken = admin.createPasswordResetToken();
        await admin.save({ validateBeforeSave: false });

        const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #333;">Password Reset Request</h1>
                <p>Hello ${admin.name || 'Admin'},</p>
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
                <p>This link will expire in 10 minutes.</p>
                <p style="color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #0066cc;">${resetURL}</p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p>Best regards,<br>MabiconsERP Team</p>
            </div>
        `;

        try {
            await sendEmail({
                email: admin.email,
                subject: 'Password Reset Request',
                htmlContent,
                name: admin.name
            });

            res.status(200).json({
                status: 'success',
                message: 'Password reset instructions sent to email!'
            });
        } catch (err) {
            admin.resetPasswordToken = undefined;
            admin.resetPasswordExpires = undefined;
            await admin.save({ validateBeforeSave: false });

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
        const { token } = req.params;
        const { password } = req.body;

        // Validate password
        if (!password) {
            return res.status(400).json({
                message: 'New password is required'
            });
        }

        // Hash the reset token from params
        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Find admin with valid token
        const admin = await Admin.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!admin) {
            return res.status(400).json({
                message: 'Token is invalid or has expired'
            });
        }

        // Hash the new password using your existing hashPassword function
        const newHashedPassword = await hashPassword(password);

        // Update admin's password and clear reset token fields
        admin.password = newHashedPassword;
        admin.resetPasswordToken = undefined;
        admin.resetPasswordExpires = undefined;

        await admin.save();

        // Generate new login token
        const loginToken = generateToken({
            id: admin._id,
            email: admin.email,
            role: 'Admin'
        });

        // Send success response
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
    createAdmin,
    loginAdmin,
    editAdmin,
    deleteAdmin,
    getAdminHierarchy,
    updateAdminPassword,
    forgotPassword,
    resetPassword
};
