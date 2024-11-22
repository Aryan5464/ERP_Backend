const { Client } = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { uploadFileToDrive, createFolder } = require('../utils/googleDriveServices');
const { generateToken } = require('../utils/jwtUtils');
const formidable = require("formidable");
const { google } = require("googleapis");


const signupClient = async (req, res) => {
    try {
        const { name, email, password, companyName, corporateAddress, contactNumber, gstNumber, panNumber, numberOfCompanies, authorizedSignatory, ownerDirectorDetails, website } = req.body;

        // Validate required fields
        if (!name || !email || !password || !companyName || !corporateAddress || !contactNumber || !gstNumber || !panNumber || !authorizedSignatory || !authorizedSignatory.name || !authorizedSignatory.contact || !Array.isArray(ownerDirectorDetails) || ownerDirectorDetails.length === 0) {
            return res.status(400).json({ message: 'All required fields must be filled out.' });
        }

        // Check for existing client with the same email
        const existingClient = await Client.findOne({ email });
        if (existingClient) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        // Hash the password
        const hashedPassword = await hashPassword(password);

        // Create a new client
        const client = new Client({ name, email, password: hashedPassword, companyName, corporateAddress, contactNumber, gstNumber, panNumber, numberOfCompanies, authorizedSignatory, ownerDirectorDetails, website });

        // Save the client to the database
        await client.save();

        res.status(201).json({
            message: 'Client registered successfully',
            client: {
                id: client._id,
                name: client.name,
                email: client.email,
                companyName: client.companyName,
                status: client.status,
                gstNumber: client.gstNumber,
                panNumber: client.panNumber,
                website: client.website
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

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find the client by email
        const client = await Client.findOne({ email });
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        // Validate the password
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
                status: client.status,
                website: client.website,
                gstNumber: client.gstNumber,
                panNumber: client.panNumber
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

        if (action === 'Accepted') {
            // Ensure teamLeaderId is provided for accepted requests
            if (!teamLeaderId) {
                return res.status(400).json({ message: 'Team Leader ID is required to accept the client.' });
            }

            // Update the client status to 'Accepted' and connect to the Team Leader
            client.status = 'Accepted';
            client.teamLeader = teamLeaderId;

            // Save the updated client information
            await client.save();

            // Add the client ID to the Team Leader's clients array
            const updateResult = await TeamLeader.findByIdAndUpdate(
                teamLeaderId,
                { $addToSet: { clients: clientId } }, // Use $addToSet to prevent duplicates
                { new: true }
            );

            if (!updateResult) {
                return res.status(404).json({ message: 'Team Leader not found' });
            }
        } else {
            // Update the client status to 'Rejected'
            client.status = 'Rejected';

            // Save the updated client information
            await client.save();
        }

        res.status(200).json({
            message: `Client ${action.toLowerCase()} successfully`,
            client: {
                id: client._id,
                name: client.name,
                email: client.email,
                status: client.status,
                teamLeader: client.teamLeader || null
            }
        });
    } catch (error) {
        console.error('Error onboarding client:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const editClient = async (req, res) => {
    try {
        const {
            clientId,
            name,
            password,
            companyName,
            corporateAddress,
            contactNumber,
            gstNumber,
            panNumber,
            numberOfCompanies,
            website,
            authorizedSignatory,
            ownerDirectorDetails
        } = req.body;

        // Validate required fields
        if (!clientId) {
            return res.status(400).json({ message: 'Client ID is required' });
        }

        // Find the client by ID
        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        // Update fields if provided
        if (name) client.name = name;
        if (password) {
            client.password = await hashPassword(password);
        }
        if (companyName) client.companyName = companyName;
        if (corporateAddress) client.corporateAddress = corporateAddress;
        if (contactNumber) client.contactNumber = contactNumber;
        if (gstNumber) client.gstNumber = gstNumber;
        if (panNumber) client.panNumber = panNumber;
        if (numberOfCompanies !== undefined) client.numberOfCompanies = numberOfCompanies; // Allow 0
        if (website) client.website = website;

        // Update authorized signatory if provided
        if (authorizedSignatory) {
            if (authorizedSignatory.name) client.authorizedSignatory.name = authorizedSignatory.name;
            if (authorizedSignatory.email) client.authorizedSignatory.email = authorizedSignatory.email;
            if (authorizedSignatory.contact) client.authorizedSignatory.contact = authorizedSignatory.contact;
        }

        // Update owner/director details if provided
        if (Array.isArray(ownerDirectorDetails) && ownerDirectorDetails.length > 0) {
            client.ownerDirectorDetails = ownerDirectorDetails;
        }

        // Save updated client
        await client.save();

        res.status(200).json({
            message: 'Client updated successfully',
            client: {
                id: client._id,
                name: client.name,
                email: client.email,
                companyName: client.companyName,
                corporateAddress: client.corporateAddress,
                contactNumber: client.contactNumber,
                gstNumber: client.gstNumber,
                panNumber: client.panNumber,
                numberOfCompanies: client.numberOfCompanies,
                website: client.website,
                authorizedSignatory: client.authorizedSignatory,
                ownerDirectorDetails: client.ownerDirectorDetails
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

// Function to retrieve all clients
const getAllClients = async (req, res) => {
    try {
        // Find all clients and populate the team leader information
        const clients = await Client.find()
            .populate('teamLeader', 'name email') // Populate team leader's name and email
            .select('name email companyName companyAddress contactNumber gstNumber status teamLeader'); // Select necessary fields including gstNumber

        res.status(200).json({
            message: 'Clients retrieved successfully',
            clients
        });
    } catch (error) {
        console.error('Error retrieving clients:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const getClientsForTeamLeader = async (req, res) => {
    try {
        const { teamLeaderId } = req.body;

        // Validate the input
        if (!teamLeaderId) {
            return res.status(400).json({ message: 'Team Leader ID is required.' });
        }

        // Fetch clients associated with the team leader and with status 'Accepted'
        const clients = await Client.find({
            teamLeader: teamLeaderId,
            status: 'Accepted'
        });

        // Check if no clients are found
        if (!clients || clients.length === 0) {
            return res.status(404).json({ message: 'No clients found for this team leader.' });
        }

        // Return the list of clients
        res.status(200).json({
            message: 'Clients fetched successfully',
            clients
        });
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ message: 'Server error while fetching clients' });
    }
};

const uploadDocuments = async (req, res) => {
    const form = new formidable.IncomingForm({ multiples: true });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            return res.status(500).json({ message: "File parsing error", error: err });
        }

        const { clientId } = fields;
        if (!clientId) {
            return res.status(400).json({ message: "Client ID is required" });
        }

        try {
            const client = await Client.findById(clientId);
            if (!client) {
                return res.status(404).json({ message: "Client not found" });
            }

            // Step 1: Create folder structure in Google Drive
            const clientsFolderId = await createFolder("Clients");
            const clientFolderName = `${client.name}_${client.contactNumber}`;
            const clientFolderId = await createFolder(clientFolderName, clientsFolderId);

            // Step 2: Upload files to the Drive folder
            const uploadedFiles = {};
            for (const [key, file] of Object.entries(files)) {
                if (file) {
                    const fileId = await uploadFileToDrive(clientFolderId, file);
                    uploadedFiles[key] = fileId;
                }
            }

            // Step 3: Update the client document in MongoDB
            client.documents = { ...client.documents, ...uploadedFiles };
            await client.save();

            res.json({ message: "Documents uploaded successfully", uploadedFiles });
        } catch (error) {
            console.error("Error in document upload:", error);
            res.status(500).json({ message: "Error in document upload", error });
        }
    });
};


module.exports = {
    signupClient,
    loginClient,
    onboardClient,
    editClient,
    deleteClient,
    getAllClients,
    getClientsForTeamLeader, 
    uploadDocuments
};