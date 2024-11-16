const { Client } = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');

const signupClient = async (req, res) => {
    try {
        const { name, email, password, companyName, companyAddress, contactNumber, gstNumber } = req.body;

        if (!name || !email || !password || !companyName) {
            return res.status(400).json({ message: 'All required fields must be filled out.' });
        }

        const existingClient = await Client.findOne({ email });
        if (existingClient) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        const hashedPassword = await hashPassword(password);

        const client = new Client({
            name,
            email,
            password: hashedPassword,
            companyName,
            companyAddress,
            contactNumber,
            gstNumber // New field
        });

        await client.save();

        res.status(201).json({
            message: 'Client registered successfully',
            client: {
                id: client._id,
                name: client.name,
                email: client.email,
                companyName: client.companyName,
                status: client.status,
                gstNumber: client.gstNumber
            }
        });
    } catch (error) {
        console.error('Error registering client:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const loginClient = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if email and password are provided
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find the client by email
        const client = await Client.findOne({ email });
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        // Compare the provided password with the stored hashed password
        const isPasswordValid = await comparePasswords(password, client.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate a JWT token
        const token = generateToken({ id: client._id, email: client.email, role: 'Client' });

        res.status(200).json({
            message: 'Login successful',
            token,
            client: {
                id: client._id,
                name: client.name,
                email: client.email,
                companyName: client.companyName,
                status: client.status
            }
        });
    } catch (error) {
        console.error('Error logging in client:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const onboardClient = async (req, res) => {
    try {
        const { clientId, action, teamLeaderId } = req.body;

        // Validate required fields
        if (!clientId || !action || !['Accepted', 'Rejected'].includes(action)) {
            return res.status(400).json({ message: 'Client ID and a valid action (Accepted or Rejected) are required.' });
        }

        // Find the client with 'Requested' status
        const client = await Client.findOne({ _id: clientId, status: 'Requested' });
        if (!client) {
            return res.status(404).json({ message: 'Client not found or already processed' });
        }

        // Process action
        if (action === 'Accepted') {
            // Ensure teamLeaderId is provided for accepted requests
            if (!teamLeaderId) {
                return res.status(400).json({ message: 'Team Leader ID is required to accept the client.' });
            }

            // Update the client status to 'Accepted' and connect to the Team Leader
            client.status = 'Accepted';
            client.teamLeader = teamLeaderId;
        } else {
            // Update the client status to 'Rejected'
            client.status = 'Rejected';
        }

        // Save the updated client information
        await client.save();

        res.status(200).json({
            message: `Client ${action.toLowerCase()} successfully`,
            client: {
                id: client._id,
                name: client.name,
                email: client.email,
                status: client.status,
                teamLeader: client.teamLeader
            }
        });
    } catch (error) {
        console.error('Error onboarding client:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const editClient = async (req, res) => {
    try {
        const { clientId, name, password, companyName, companyAddress, contactNumber, gstNumber } = req.body;

        if (!clientId) {
            return res.status(400).json({ message: 'Client ID is required' });
        }

        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        if (name) client.name = name;
        if (companyName) client.companyName = companyName;
        if (companyAddress) client.companyAddress = companyAddress;
        if (contactNumber) client.contactNumber = contactNumber;
        if (gstNumber) client.gstNumber = gstNumber; // New field
        if (password) {
            client.password = await hashPassword(password);
        }

        await client.save();

        res.status(200).json({
            message: 'Client updated successfully',
            client: {
                id: client._id,
                name: client.name,
                email: client.email,
                companyName: client.companyName,
                companyAddress: client.companyAddress,
                contactNumber: client.contactNumber,
                gstNumber: client.gstNumber // New field
            }
        });
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const deleteClient = async (req, res) => {
    try {
        const { clientId } = req.body;

        // Validate client ID
        if (!clientId) {
            return res.status(400).json({ message: 'Client ID is required' });
        }

        // Find and delete the client by ID
        const client = await Client.findByIdAndDelete(clientId);
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        res.status(200).json({ message: 'Client deleted successfully' });
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    signupClient,
    loginClient,
    onboardClient,
    editClient,
    deleteClient
};