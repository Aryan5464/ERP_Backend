// controllers/superAdminController.js

const {SuperAdmin} = require('../models/models');
const { comparePasswords, hashPassword } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');

// Function to login SuperAdmin
const loginSuperAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate email and password
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find SuperAdmin by email
        const superAdmin = await SuperAdmin.findOne({ email });
        if (!superAdmin) {
            return res.status(404).json({ message: 'SuperAdmin not found' });
        }

        // Compare provided password with the stored hashed password
        const isPasswordValid = await comparePasswords(password, superAdmin.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = generateToken({ id: superAdmin._id, email: superAdmin.email, role: 'SuperAdmin' });

        res.status(200).json({
            message: 'Login successful',
            token,
            superAdmin: {
                id: superAdmin._id,
                name: superAdmin.name,
                email: superAdmin.email
            }
        });
    } catch (error) {
        console.error('Error logging in SuperAdmin:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Function to edit SuperAdmin
const editSuperAdmin = async (req, res) => {
    try {
        const { superAdminId, name, password } = req.body; // SuperAdmin details

        // Validate SuperAdmin ID
        if (!superAdminId) {
            return res.status(400).json({ message: 'SuperAdmin ID is required' });
        }

        // Find SuperAdmin by ID
        const superAdmin = await SuperAdmin.findById(superAdminId);
        if (!superAdmin) {
            return res.status(404).json({ message: 'SuperAdmin not found' });
        }

        // Update fields if provided
        if (name) superAdmin.name = name;
        if (password) {
            // Hash the new password before saving
            superAdmin.password = await hashPassword(password);
        }

        // Save updated SuperAdmin
        await superAdmin.save();

        res.status(200).json({
            message: 'SuperAdmin updated successfully',
            superAdmin: {
                id: superAdmin._id,
                name: superAdmin.name,
                email: superAdmin.email
            }
        });
    } catch (error) {
        console.error('Error updating SuperAdmin:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    loginSuperAdmin,
    editSuperAdmin
};
