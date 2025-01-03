const { Client, TeamLeader } = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { drive, uploadFileToDrive, getOrCreateFolder, getFileLink, deleteFile } = require('../utils/googleDriveServices');
const { generateToken } = require('../utils/jwtUtils'); 
// const fs = require("fs");
const fs = require("fs/promises"); // Use the promise-based API 

const busboy = require('busboy');
const { Readable } = require('stream');
const mime = require('mime-types'); // Add this package for MIME type validation

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

const getClientDetails = async (req, res) => {
    try {
        const { clientId } = req.body;

        // Validate client ID
        if (!clientId) {
            return res.status(400).json({
                success: false,
                message: 'Client ID is required'
            });
        }

        // Find client and populate essential relations
        const client = await Client.findById(clientId)
            .populate('teamLeader', 'name email contactNumber')
            .populate('tasks', 'title description status dueDate priority')
            .select('-password'); // Exclude password from response

        // Check if client exists
        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        // Send successful response
        res.status(200).json({
            success: true,
            data: client
        });

    } catch (error) {
        console.error('Error fetching client details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching client details'
        });
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

// Configuration
// const CONFIG = {
//     MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
//     ALLOWED_MIME_TYPES: [
//         'image/jpeg',
//         'image/png',
//         'image/jpg',
//         'application/pdf',
//         'application/msword',
//         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
//     ]
// };

const uploadDocuments = async (req, res) => {
    let clientId = null;
    let clientFolderId = null;
    let client = null;
    const uploadedFiles = {};
    const fileBuffers = {};

    try {
        const bb = busboy({ 
            headers: req.headers,
            limits: {
                fileSize: 10 * 1024 * 1024,
                files: 5
            }
        });

        const uploadProcess = new Promise((resolve, reject) => {
            let clientSetupComplete = false;
            const filePromises = [];

            // Handle fields first
            bb.on('field', async (name, value) => {
                if (name === 'clientId') {
                    try {
                        console.log('Received clientId:', value);
                        clientId = value;
                        
                        // Find client
                        client = await Client.findById(clientId);
                        if (!client) {
                            throw new Error('Client not found');
                        }
                        console.log('Found client:', client.name);

                        // Set up folders
                        const clientsFolderId = await getOrCreateFolder("Clients");
                        console.log('Created/found Clients folder:', clientsFolderId);
                        
                        const clientFolderName = `${client.name}_${client.contactNumber}`;
                        clientFolderId = await getOrCreateFolder(clientFolderName, clientsFolderId);
                        console.log('Created/found client folder:', clientFolderId);

                        clientSetupComplete = true;
                    } catch (error) {
                        console.error('Error in client setup:', error);
                        reject(error);
                    }
                }
            });

            // Handle files
            bb.on('file', (fieldname, file, fileInfo) => {
                console.log('Processing file:', fieldname);
                fileBuffers[fieldname] = [];
                
                file.on('data', data => {
                    fileBuffers[fieldname].push(data);
                });

                file.on('end', () => {
                    console.log(`File ${fieldname} buffered`);
                });
            });

            // Handle completion
            bb.on('finish', async () => {
                try {
                    console.log('Upload process finishing...');
                    
                    // Wait for client setup to complete
                    let attempts = 0;
                    while (!clientSetupComplete && attempts < 10) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        attempts++;
                    }

                    if (!clientSetupComplete) {
                        throw new Error('Client setup timed out');
                    }

                    if (!client || !clientFolderId) {
                        throw new Error('Client setup incomplete - Make sure clientId is sent before files');
                    }

                    // Process buffered files
                    for (const [fieldname, buffers] of Object.entries(fileBuffers)) {
                        const filePromise = (async () => {
                            try {
                                const fileBuffer = Buffer.concat(buffers);
                                const fileStream = new Readable();
                                fileStream.push(fileBuffer);
                                fileStream.push(null);

                                const response = await drive.files.create({
                                    requestBody: {
                                        name: fieldname,
                                        parents: [clientFolderId],
                                    },
                                    media: {
                                        mimeType: 'application/octet-stream',
                                        body: fileStream
                                    },
                                    fields: 'id',
                                });

                                uploadedFiles[fieldname] = response.data.id;
                                return {
                                    fieldname,
                                    fileId: response.data.id,
                                    filename: fieldname
                                };
                            } catch (error) {
                                console.error(`Error uploading ${fieldname}:`, error);
                                throw error;
                            }
                        })();

                        filePromises.push(filePromise);
                    }

                    const results = await Promise.all(filePromises);
                    console.log('All files processed');

                    // Update client documents
                    client.documents = { ...client.documents, ...uploadedFiles };
                    await client.save();
                    console.log('Client documents updated');

                    resolve(results);
                } catch (error) {
                    console.error('Error in finish handler:', error);
                    reject(error);
                }
            });

            bb.on('error', (error) => {
                console.error('Busboy error:', error);
                reject(error);
            });
        });

        req.pipe(bb);

        const results = await uploadProcess;

        res.status(200).json({
            message: "Documents uploaded successfully",
            uploadedFiles: results.reduce((acc, file) => {
                acc[file.fieldname] = file.fileId;
                return acc;
            }, {})
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            message: error.message || "Upload failed",
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Get document links function remains largely the same
const getDocLinks = async (req, res) => {
    try {
        const { clientId } = req.body;
        
        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: "Client not found" });
        }

        const documents = client.documents || {};
        const documentLinks = {};

        // Process all documents in parallel
        await Promise.all(
            Object.entries(documents).map(async ([docName, fileId]) => {
                if (fileId) {
                    try {
                        const links = await getFileLink(fileId);
                        documentLinks[docName] = links;
                    } catch (error) {
                        console.error(`Error fetching link for document "${docName}":`, error);
                        documentLinks[docName] = { error: "Failed to fetch link" };
                    }
                } else {
                    documentLinks[docName] = { error: "File ID not available" };
                }
            })
        );

        res.status(200).json({
            message: "Document links retrieved successfully",
            documentLinks,
        });
    } catch (error) {
        console.error("Error retrieving document links:", error);
        res.status(500).json({ 
            message: "Failed to retrieve document links", 
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};


module.exports = {
    signupClient,
    loginClient,
    onboardClient,
    getClientDetails,
    editClient,
    deleteClient,
    getAllClients,
    getClientsForTeamLeader,
    uploadDocuments,
    getDocLinks
};