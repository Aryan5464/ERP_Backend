// controllers/adminController.js

const {Admin} = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');

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



module.exports = {
    createAdmin,
    loginAdmin,
    editAdmin,
    deleteAdmin,
    getAdminHierarchy,
    updateAdminPassword
};
