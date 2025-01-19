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
            authorizedSignatory,
            ownerDirectorDetails,
            website
        } = req.body;

        // Validate required fields
        if (!name || !email || !companyName || !corporateAddress ||
            !contactNumber || !gstNumber || !panNumber || !cinNumber ||
            !authorizedSignatory || !authorizedSignatory.name ||
            !authorizedSignatory.contact || !Array.isArray(ownerDirectorDetails) ||
            ownerDirectorDetails.length === 0) {
            return res.status(400).json({ message: 'All required fields must be filled out.' });
        }

        const password = `${companyName}@123`;

        // Check for existing client with the same email
        const existingClient = await Client.findOne({ email });
        if (existingClient) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        // Hash the password
        const hashedPassword = await hashPassword(password);

        // Create a new client
        const client = new Client({
            name,
            email,
            password: hashedPassword,
            companyName,
            corporateAddress,
            contactNumber,
            gstNumber,
            panNumber,
            cinNumber,  // Add this new field
            numberOfCompanies,
            authorizedSignatory,
            ownerDirectorDetails,
            website
        });

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
                cinNumber: client.cinNumber, // Add this to the response
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

        // Validate MongoDB ObjectId format
        if (!mongoose.Types.ObjectId.isValid(clientId)) {
            return res.status(400).json({ message: 'Invalid client ID format' });
        }

        // Find the client with populated teamLeader field
        const client = await Client.findOne({ _id: clientId, status: 'Requested' })
            .populate('teamLeader');

        if (!client) {
            return res.status(404).json({ message: 'Client not found or already processed' });
        }

        if (action === 'Accepted') {
            // Validate teamLeaderId
            if (!teamLeaderId || !mongoose.Types.ObjectId.isValid(teamLeaderId)) {
                return res.status(400).json({ message: 'Valid Team Leader ID is required to accept the client.' });
            }

            // Check if TeamLeader exists
            const teamLeader = await TeamLeader.findById(teamLeaderId);
            if (!teamLeader) {
                return res.status(404).json({ message: 'Team Leader not found' });
            }

            // Check if client is already assigned to a team leader
            if (client.teamLeader) {
                return res.status(400).json({ message: 'Client is already assigned to a team leader' });
            }

            // Generate default password
            const defaultPassword = `${client.companyName}@123`;
            const hashedPassword = await hashPassword(defaultPassword);

            try {
                // Use transaction for atomic operations
                const session = await mongoose.startSession();
                await session.withTransaction(async () => {
                    // Update client
                    client.status = 'Accepted';
                    client.teamLeader = teamLeaderId;
                    client.password = hashedPassword;
                    await client.save({ session });

                    // Update TeamLeader
                    await TeamLeader.findByIdAndUpdate(
                        teamLeaderId,
                        { $addToSet: { clients: clientId } },
                        { session, new: true }
                    );
                });
                session.endSession();

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
                            <p><strong>Default Password:</strong> ${defaultPassword}</p>
                            <p>For security reasons, we recommend changing your password after your first login.</p>
                            <p>You can access your dashboard at: <a href="https://erp.mabicons.com">https://erp.mabicons.com</a></p>
                            <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                            <p>Best regards,<br>MabiconsERP Team</p>
                        `
                    });
                } catch (emailError) {
                    console.error('Error sending onboarding email:', emailError);
                    // Log email error but continue with the process
                }

            } catch (transactionError) {
                console.error('Transaction error:', transactionError);
                return res.status(500).json({ message: 'Error updating client and team leader' });
            }

        } else {
            // Handle rejection
            client.status = 'Rejected';
            await client.save();

            try {
                await sendEmail({
                    email: client.email,
                    name: client.name,
                    subject: 'MabiconsERP Application Status',
                    htmlContent: `
                        <p>Dear ${client.name},</p>
                        <p>We regret to inform you that your application for MabiconsERP has been declined at this time.</p>
                        <p>If you have any questions, please contact our support team.</p>
                        <p>Best regards,<br>MabiconsERP Team</p>
                    `
                });
            } catch (emailError) {
                console.error('Error sending rejection email:', emailError);
            }
        }

        res.status(200).json({
            message: `Client ${action.toLowerCase()} successfully`,
            client: {
                id: client._id,
                name: client.name,
                email: client.email,
                status: client.status,
                teamLeader: client.teamLeader ? {
                    id: client.teamLeader._id,
                    name: client.teamLeader.name,
                    email: client.teamLeader.email
                } : null
            }
        });

    } catch (error) {
        console.error('Error onboarding client:', error);
        res.status(500).json({
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getClientDetails = async (req, res) => {
    try {
        const { clientId } = req.body;

        // Validate client ID
        if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
            return res.status(400).json({
                success: false,
                message: 'Valid Client ID is required'
            });
        }

        // Find client and populate essential relations
        const client = await Client.findById(clientId)
            .populate('teamLeader', 'name email phone')
            .populate({
                path: 'tasks',
                select: 'title description status dueDate priority createdAt updatedAt',
                options: { sort: { 'createdAt': -1 } }
            })
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
            data: {
                ...client.toObject(),
                documentsStatus: {
                    employeeMasterDatabase: client.documents.employeeMasterDatabase ? true : false,
                    currentSalaryStructure: client.documents.currentSalaryStructure ? true : false,
                    previousSalarySheets: client.documents.previousSalarySheets ? true : false,
                    currentHRPolicies: client.documents.currentHRPolicies ? true : false,
                    leaveBalance: client.documents.leaveBalance ? true : false,
                    companyLogo: client.documents.companyLogo ? true : false,
                    letterhead: client.documents.letterhead ? true : false
                }
            }
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
        // Add filtering options
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.search) {
            filter.$or = [
                { name: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
                { companyName: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        // Find all clients with filtering
        const clients = await Client.find(filter)
            .populate('teamLeader', 'name email phone')
            .select('name email companyName corporateAddress contactNumber gstNumber panNumber cinNumber status teamLeader createdAt')
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
            message: 'Error retrieving clients',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
            cinNumber,
            numberOfCompanies,
            website,
            authorizedSignatory,
            ownerDirectorDetails
        } = req.body;

        // Validate client ID
        if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
            return res.status(400).json({ message: 'Valid Client ID is required' });
        }

        // Find the client by ID
        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        // Create update object
        const updates = {};
        if (name) updates.name = name;
        if (password) updates.password = await hashPassword(password);
        if (companyName) updates.companyName = companyName;
        if (corporateAddress) updates.corporateAddress = corporateAddress;
        if (contactNumber) updates.contactNumber = contactNumber;
        if (gstNumber) updates.gstNumber = gstNumber;
        if (panNumber) updates.panNumber = panNumber;
        if (cinNumber) updates.cinNumber = cinNumber;
        if (numberOfCompanies !== undefined) updates.numberOfCompanies = numberOfCompanies;
        if (website) updates.website = website;

        // Update authorized signatory if provided
        if (authorizedSignatory) {
            updates.authorizedSignatory = {
                ...client.authorizedSignatory,
                ...authorizedSignatory
            };
        }

        // Update owner/director details if provided
        if (Array.isArray(ownerDirectorDetails) && ownerDirectorDetails.length > 0) {
            updates.ownerDirectorDetails = ownerDirectorDetails;
        }

        // Update client with new values
        const updatedClient = await Client.findByIdAndUpdate(
            clientId,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedClient) {
            return res.status(404).json({ message: 'Client update failed' });
        }

        res.status(200).json({
            success: true,
            message: 'Client updated successfully',
            data: updatedClient
        });
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error updating client',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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