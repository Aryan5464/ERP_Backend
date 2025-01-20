const { Client, TeamLeader } = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { drive, getOrCreateFolder, updateFilePermissions } = require('../utils/googleDriveServices');
const { generateToken } = require('../utils/jwtUtils');
// const fs = require("fs");
const fs = require("fs/promises"); // Use the promise-based API 

const busboy = require('busboy');
const { Readable } = require('stream');
const mime = require('mime-types'); // Add this package for MIME type validation
const sendEmail = require('../utils/emailService');
const mongoose = require('mongoose');


const signupClient = async (req, res) => {
    try {
        const { 
            name, 
            email, 
            companyName, 
            corporateAddress, 
            contactNumber, 
            gstNumber, 
            panNumber, 
            cinNumber,
            numberOfCompanies, 
            spocName,           // Added SPOC Name
            spocContact,        // Added SPOC Contact
            authorizedSignatory, 
            ownerDirectorDetails, 
            website 
        } = req.body;

        // Validate required fields
        if (!name || !email || !companyName || !corporateAddress || 
            !contactNumber || !gstNumber || !panNumber || !authorizedSignatory || 
            !authorizedSignatory.name || !authorizedSignatory.contact || 
            !Array.isArray(ownerDirectorDetails) || ownerDirectorDetails.length === 0) {
            return res.status(400).json({ message: 'All required fields must be filled out.' });
        }

        const password = `${companyName}@123`;

        // Check for existing client
        const existingClient = await Client.findOne({ email });
        if (existingClient) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        // Hash the password
        const hashedPassword = await hashPassword(password);

        // Create new client
        const client = new Client({ 
            name, 
            email, 
            password: hashedPassword, 
            companyName, 
            corporateAddress, 
            contactNumber, 
            gstNumber, 
            panNumber, 
            cinNumber,
            numberOfCompanies, 
            spocName,
            spocContact,
            authorizedSignatory, 
            ownerDirectorDetails, 
            website 
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
                gstNumber: client.gstNumber,
                panNumber: client.panNumber,
                cinNumber: client.cinNumber,
                spocName: client.spocName,
                spocContact: client.spocContact,
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
    let session;
    try {
        const { clientId, action, teamLeaderId } = req.body;
        console.log('Received request:', { clientId, action, teamLeaderId }); // Log incoming request

        // Validate required fields
        if (!clientId || !action || !['Accepted', 'Rejected'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Client ID and a valid action (Accepted or Rejected) are required.'
            });
        }

        // Validate MongoDB ObjectId format
        if (!mongoose.Types.ObjectId.isValid(clientId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid client ID format'
            });
        }

        // Find the client
        const client = await Client.findOne({ _id: clientId });
        console.log('Found client:', client); // Log client data

        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        // Check client status
        if (client.status !== 'Requested') {
            return res.status(400).json({
                success: false,
                message: `Client has already been ${client.status.toLowerCase()}`
            });
        }

        if (action === 'Accepted') {
            // Validate teamLeaderId
            if (!teamLeaderId || !mongoose.Types.ObjectId.isValid(teamLeaderId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid Team Leader ID is required to accept the client.'
                });
            }

            // Check if TeamLeader exists
            const teamLeader = await TeamLeader.findById(teamLeaderId);
            console.log('Found team leader:', teamLeader); // Log team leader data

            if (!teamLeader) {
                return res.status(404).json({
                    success: false,
                    message: 'Team Leader not found'
                });
            }

            try {
                // Generate default password
                const defaultPassword = `${client.companyName.replace(/\s+/g, '')}@123`;
                const hashedPassword = await hashPassword(defaultPassword);

                // Update client without transaction first
                client.status = 'Accepted';
                client.teamLeader = teamLeaderId;
                client.password = hashedPassword;
                await client.save();

                // Update TeamLeader
                await TeamLeader.findByIdAndUpdate(
                    teamLeaderId,
                    { $addToSet: { clients: clientId } }
                );

                // Send onboarding email
                try {
                    await sendEmail({
                        email: client.email,
                        name: client.name,
                        subject: 'Welcome to MabiconsERP - Account Activated',
                        htmlContent: `
                            <h2>Welcome to MabiconsERP!</h2>
                            <p>Dear ${client.name},</p>
                            <p>Your account has been successfully activated. You can now login to your dashboard using the following credentials:</p>
                            <p><strong>Email:</strong> ${client.email}</p>
                            <p><strong>Password:</strong> ${defaultPassword}</p>
                            <p><strong style="color: red;">Important:</strong> Please change your password after your first login for security purposes.</p>
                            <p>Access your dashboard at: <a href="https://erp.mabicons.com">https://erp.mabicons.com</a></p>
                            <p>Best regards,<br>MabiconsERP Team</p>
                        `
                    });
                } catch (emailError) {
                    console.error('Error sending onboarding email:', emailError);
                    // Continue process but log error
                }

                // Send success response
                return res.status(200).json({
                    success: true,
                    message: 'Client accepted successfully',
                    data: {
                        id: client._id,
                        name: client.name,
                        email: client.email,
                        companyName: client.companyName,
                        status: client.status,
                        teamLeader: {
                            id: teamLeader._id,
                            name: teamLeader.name,
                            email: teamLeader.email,
                            phone: teamLeader.phone
                        }
                    }
                });

            } catch (error) {
                console.error('Error in update process:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Error updating client and team leader',
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
        // ... rest of the code for rejection case

    } catch (error) {
        console.error('Error in onboarding process:', error);
        return res.status(500).json({
            success: false,
            message: 'Error processing client onboarding request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getClientDetails = async (req, res) => {
    try {
        const { clientId } = req.body;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                message: 'Client ID is required'
            });
        }

        // Find client and populate teamLeader
        const client = await Client.findById(clientId)
            .populate({
                path: 'teamLeader',
                select: 'name email phone'
            })
            .select('-password')
            .lean();

        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        // Organize the response data
        const clientData = {
            // Basic Information
            _id: client._id,
            name: client.name,
            email: client.email,
            contactNumber: client.contactNumber,
            status: client.status,

            // Company Information
            companyName: client.companyName,
            corporateAddress: client.corporateAddress,
            website: client.website,
            numberOfCompanies: client.numberOfCompanies,

            // Registration Numbers
            gstNumber: client.gstNumber,
            panNumber: client.panNumber,
            cinNumber: client.cinNumber,

            // SPOC Information
            spocName: client.spocName,
            spocContact: client.spocContact,

            // Key Personnel
            authorizedSignatory: {
                name: client.authorizedSignatory?.name || null,
                email: client.authorizedSignatory?.email || null,
                contact: client.authorizedSignatory?.contact || null
            },

            // Owner/Director Details
            ownerDirectorDetails: client.ownerDirectorDetails || [],

            // Documents
            documents: {
                employeeMasterDatabase: client.documents?.employeeMasterDatabase || null,
                currentSalaryStructure: client.documents?.currentSalaryStructure || null,
                previousSalarySheets: client.documents?.previousSalarySheets || null,
                currentHRPolicies: client.documents?.currentHRPolicies || null,
                leaveBalance: client.documents?.leaveBalance || null,
                companyLogo: client.documents?.companyLogo || null,
                letterhead: client.documents?.letterhead || null
            },

            // Team Leader Information
            teamLeader: client.teamLeader ? {
                _id: client.teamLeader._id,
                name: client.teamLeader.name,
                email: client.teamLeader.email,
                phone: client.teamLeader.phone
            } : null,

            // Timestamps
            createdAt: client.createdAt,
            updatedAt: client.updatedAt
        };

        res.status(200).json({
            success: true,
            message: 'Client details retrieved successfully',
            data: clientData
        });

    } catch (error) {
        console.error('Error fetching client details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching client details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getAllClients = async (req, res) => {
    try {
        const clients = await Client.find()
            .populate('teamLeader', 'name email phone')
            .select('name email companyName corporateAddress contactNumber gstNumber panNumber cinNumber spocName spocContact status teamLeader createdAt')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            message: 'Clients retrieved successfully',
            data: {
                count: clients.length,
                clients
            }
        });
    } catch (error) {
        console.error('Error retrieving clients:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error retrieving clients'
        });
    }
};

// Edit Client Function
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
            cinNumber,
            numberOfCompanies,
            spocName,
            spocContact,
            website,
            authorizedSignatory,
            ownerDirectorDetails
        } = req.body;

        if (!clientId) {
            return res.status(400).json({ message: 'Client ID is required' });
        }

        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        // Update fields if provided
        if (name) client.name = name;
        if (password) client.password = await hashPassword(password);
        if (companyName) client.companyName = companyName;
        if (corporateAddress) client.corporateAddress = corporateAddress;
        if (contactNumber) client.contactNumber = contactNumber;
        if (gstNumber) client.gstNumber = gstNumber;
        if (panNumber) client.panNumber = panNumber;
        if (cinNumber) client.cinNumber = cinNumber;
        if (numberOfCompanies !== undefined) client.numberOfCompanies = numberOfCompanies;
        if (spocName) client.spocName = spocName;
        if (spocContact) client.spocContact = spocContact;
        if (website) client.website = website;

        if (authorizedSignatory) {
            if (authorizedSignatory.name) client.authorizedSignatory.name = authorizedSignatory.name;
            if (authorizedSignatory.email) client.authorizedSignatory.email = authorizedSignatory.email;
            if (authorizedSignatory.contact) client.authorizedSignatory.contact = authorizedSignatory.contact;
        }

        if (Array.isArray(ownerDirectorDetails) && ownerDirectorDetails.length > 0) {
            client.ownerDirectorDetails = ownerDirectorDetails;
        }

        await client.save();

        res.status(200).json({
            success: true,
            message: 'Client updated successfully',
            data: {
                id: client._id,
                name: client.name,
                email: client.email,
                companyName: client.companyName,
                corporateAddress: client.corporateAddress,
                contactNumber: client.contactNumber,
                gstNumber: client.gstNumber,
                panNumber: client.panNumber,
                cinNumber: client.cinNumber,
                spocName: client.spocName,
                spocContact: client.spocContact,
                numberOfCompanies: client.numberOfCompanies,
                website: client.website,
                authorizedSignatory: client.authorizedSignatory,
                ownerDirectorDetails: client.ownerDirectorDetails
            }
        });
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error updating client' 
        });
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
    const fileInfos = {};

    const allowedDocumentTypes = [
        'employeeMasterDatabase',
        'currentSalaryStructure',
        'previousSalarySheets',
        'currentHRPolicies',
        'leaveBalance',
        'companyLogo',
        'letterhead'
    ];

    try {
        const bb = busboy({
            headers: req.headers,
            limits: {
                fileSize: 10 * 1024 * 1024,
                files: 7
            }
        });

        const uploadProcess = new Promise((resolve, reject) => {
            let clientSetupComplete = false;
            const filePromises = [];

            bb.on('field', async (name, value) => {
                if (name === 'clientId') {
                    try {
                        clientId = value;
                        client = await Client.findById(clientId);
                        if (!client) {
                            throw new Error('Client not found');
                        }

                        const clientsFolderId = await getOrCreateFolder("Clients");
                        const clientFolderName = `${client.name}_${client.companyName}`;
                        clientFolderId = await getOrCreateFolder(clientFolderName, clientsFolderId);
                        clientSetupComplete = true;
                    } catch (error) {
                        console.error('Error in client setup:', error);
                        reject(error);
                    }
                }
            });

            bb.on('file', (fieldname, file, info) => {
                if (!allowedDocumentTypes.includes(fieldname)) {
                    file.resume();
                    return;
                }

                fileInfos[fieldname] = info;
                fileBuffers[fieldname] = [];

                file.on('data', data => {
                    fileBuffers[fieldname].push(data);
                });
            });

            bb.on('finish', async () => {
                try {
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

                    for (const [fieldname, buffers] of Object.entries(fileBuffers)) {
                        const filePromise = (async () => {
                            try {
                                const fileBuffer = Buffer.concat(buffers);
                                const fileStream = new Readable();
                                fileStream.push(fileBuffer);
                                fileStream.push(null);

                                const documentTypeFolderName = fieldname.charAt(0).toUpperCase() + fieldname.slice(1);
                                const documentTypeFolderId = await getOrCreateFolder(documentTypeFolderName, clientFolderId);

                                const response = await drive.files.create({
                                    requestBody: {
                                        name: `${fieldname}_${new Date().toISOString()}`,
                                        parents: [documentTypeFolderId],
                                    },
                                    media: {
                                        mimeType: fileInfos[fieldname]?.mimeType || 'application/octet-stream',
                                        body: fileStream
                                    },
                                    fields: 'id, webViewLink',
                                });

                                await updateFilePermissions(response.data.id);

                                uploadedFiles[fieldname] = response.data.id;
                                return {
                                    fieldname,
                                    fileId: response.data.id,
                                    webViewLink: response.data.webViewLink,
                                    originalName: fileInfos[fieldname]?.filename
                                };
                            } catch (error) {
                                console.error(`Error uploading ${fieldname}:`, error);
                                throw error;
                            }
                        })();

                        filePromises.push(filePromise);
                    }

                    const results = await Promise.all(filePromises);

                    client.documents = {
                        ...client.documents,
                        ...uploadedFiles
                    };
                    await client.save();

                    console.log('\n📊 Final Document Structure:');
                    console.log(JSON.stringify(client.documents, null, 2));

                    console.log('\n📋 Upload Summary:');
                    results.forEach(result => {
                        console.log(`- ${result.fieldname}: ${result.fileId}`);
                        console.log(`  Link: ${result.webViewLink}`);
                        console.log(`  Original Name: ${result.originalName}`);
                    });

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
                acc[file.fieldname] = {
                    fileId: file.fileId,
                    webViewLink: file.webViewLink,
                    originalName: file.originalName
                };
                return acc;
            }, {}),
            clientDocuments: client.documents
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            message: error.message || "Upload failed",
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};


const getClientDocuments = async (req, res) => {
    try {
        const { clientId } = req.body;

        if (!clientId) {
            return res.status(400).json({ message: 'Client ID is required' });
        }

        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        const documentTypes = [
            'employeeMasterDatabase',
            'currentSalaryStructure',
            'previousSalarySheets',
            'currentHRPolicies',
            'leaveBalance',
            'companyLogo',
            'letterhead'
        ];

        const documentDetails = {};

        // Get details for each document
        for (const docType of documentTypes) {
            const fileId = client.documents[docType];
            if (fileId) {
                try {
                    const fileMetadata = await drive.files.get({
                        fileId: fileId,
                        fields: 'id, name, mimeType, webViewLink, webContentLink'
                    });

                    await updateFilePermissions(fileId);

                    documentDetails[docType] = {
                        fileId: fileMetadata.data.id,
                        name: fileMetadata.data.name,
                        mimeType: fileMetadata.data.mimeType,
                        viewLink: fileMetadata.data.webViewLink,
                        downloadLink: fileMetadata.data.webContentLink,
                        status: 'available'
                    };
                } catch (error) {
                    console.error(`Error fetching ${docType}:`, error);
                    documentDetails[docType] = {
                        status: 'unavailable',
                        error: 'File not accessible'
                    };
                }
            } else {
                documentDetails[docType] = {
                    status: 'not_uploaded',
                    error: 'Document not uploaded yet'
                };
            }
        }

        res.status(200).json({
            success: true,
            documents: documentDetails
        });

    } catch (error) {
        console.error('Error fetching client documents:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching documents',
            error: 'Internal server error'
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
    getClientDocuments
};