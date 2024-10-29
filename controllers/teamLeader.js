// controllers/teamLeaderController.js

const {TeamLeader} = require('../models/models');
const {Admin} = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');

// Function to create a new TeamLeader
const createTeamLeader = async (req, res) => {
    try {
        const { name, email, adminId, phone } = req.body; // Including phone number
        const password = 'mabicons123'

        // Check if all required fields are present
        if (!name || !email || !adminId) {
            return res.status(400).json({ message: 'All fields are required (name, email, password, adminId)' });
        }

        // Find the Admin by ID
        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Check if the email is already taken by another TeamLeader
        const existingTeamLeader = await TeamLeader.findOne({ email });
        if (existingTeamLeader) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        // Hash the password before saving
        const hashedPassword = await hashPassword(password);

        // Create the new TeamLeader
        const teamLeader = new TeamLeader({
            name,
            email,
            password: hashedPassword,
            admin: adminId,
            phone // Save phone number if provided
        });

        // Save the TeamLeader to the database
        await teamLeader.save();

        // Update the Admin to add the new TeamLeader reference
        admin.teamLeaders.push(teamLeader._id);
        await admin.save();

        res.status(201).json({
            message: 'TeamLeader created successfully',
            teamLeader: {
                id: teamLeader._id,
                name: teamLeader.name,
                email: teamLeader.email,
                phone: teamLeader.phone // Include phone in response
            }
        });
    } catch (error) {
        console.error('Error creating TeamLeader:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const loginTeamLeader = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const teamLeader = await TeamLeader.findOne({ email });
        if (!teamLeader) {
            return res.status(404).json({ message: 'Team Leader not found' });
        }

        const isPasswordValid = await comparePasswords(password, teamLeader.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = generateToken({ id: teamLeader._id, email: teamLeader.email, role: 'TeamLeader' });

        res.status(200).json({
            message: 'Login successful',
            token,
            teamLeader: {
                id: teamLeader._id,
                name: teamLeader.name,
                email: teamLeader.email
            }
        });
    } catch (error) {
        console.error('Error logging in Team Leader:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Function to edit an existing TeamLeader
const editTeamLeader = async (req, res) => {
    try {
        const { id, name, phone, password } = req.body; // TeamLeader details

        // Check if the TeamLeader ID is provided
        if (!id) {
            return res.status(400).json({ message: 'TeamLeader ID is required' });
        }

        // Find the TeamLeader by ID
        const teamLeader = await TeamLeader.findById(id);
        if (!teamLeader) {
            return res.status(404).json({ message: 'TeamLeader not found' });
        }

        // Update TeamLeader fields if they are provided
        if (name) teamLeader.name = name;
        if (phone) teamLeader.phone = phone;
        if (password) {
            // Hash the new password before saving
            teamLeader.password = await hashPassword(password);
        }

        // Save the updated TeamLeader
        await teamLeader.save();

        res.status(200).json({
            message: 'TeamLeader updated successfully',
            teamLeader: {
                id: teamLeader._id,
                name: teamLeader.name,
                email: teamLeader.email,
                phone: teamLeader.phone
            }
        });
    } catch (error) {
        console.error('Error updating TeamLeader:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const deleteTeamLeader = async (req, res) => {
    try {
        const { TlID } = req.body;

        if (!TlID) {
            return res.status(400).json({ message: 'Team Leader ID is required' });
        }

        const teamLeader = await TeamLeader.findById(TlID);
        if (!teamLeader) {
            return res.status(404).json({ message: 'Team Leader not found' });
        }

        await TeamLeader.findByIdAndDelete(TlID);

        res.status(200).json({ message: 'Team Leader deleted successfully' });
    } catch (error) {
        console.error('Error deleting Team Leader:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


module.exports = {
    createTeamLeader,
    loginTeamLeader,
    editTeamLeader,
    deleteTeamLeader
};
