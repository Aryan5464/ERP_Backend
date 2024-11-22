const { google } = require("googleapis"); // Google APIs library
const formidable = require("formidable"); // Handles file uploads
const fs = require("fs"); // For file stream operations
const { Client } = require("./models/Client"); // Import the Client schema/model


// Initialize Google Drive API client with OAuth2 authentication
const drive = google.drive({
    version: "v3", // Use Google Drive API v3
    auth: new google.auth.OAuth2(
        process.env.CLIENT_ID,       // OAuth2 client ID
        process.env.CLIENT_SECRET,   // OAuth2 client secret
        process.env.REDIRECT_URI     // Redirect URI for OAuth2
    ),
});

// Set the refresh token for authentication
drive.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN,
});

const uploadFileToDrive = async (folderId, file) => {
    const fileMetadata = {
        name: file.originalFilename, // Name of the file as it will appear in Google Drive
        parents: [folderId],         // Parent folder ID for organization
    };


    const media = {
        mimeType: file.mimetype,     // File MIME type (e.g., application/pdf)
        body: fs.createReadStream(file.filepath), // File data as a stream
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        media,                      // Media content to upload
        fields: "id",               // Only return the file ID
    });

    return response.data.id;      // Return the uploaded file's ID
};


const createFolder = async (name, parentFolderId = null) => {
    const fileMetadata = {
        name,                       // Folder name
        mimeType: "application/vnd.google-apps.folder", // MIME type for Google Drive folders
    };

    if (parentFolderId) {
        fileMetadata.parents = [parentFolderId]; // Assign to a parent folder if specified
    }

    const folder = await drive.files.create({
        resource: fileMetadata,
        fields: "id",               // Only return the folder ID
    });

    return folder.data.id;        // Return the created folder's ID
};


const uploadDocuments = async (req, res) => {
    const form = new formidable.IncomingForm({ multiples: true }); // Parse multiple files
    form.parse(req, async (err, fields, files) => {
        if (err) {
            return res.status(500).json({ message: "File upload error" }); // Handle parsing errors
        }

        const { clientId } = fields; // Extract the client ID from the request body
        if (!clientId) {
            return res.status(400).json({ message: "Client ID is required" }); // Validate the input
        }

        try {
            // Step 1: Fetch the client record using the provided clientId
            const client = await Client.findById(clientId);
            if (!client) {
                return res.status(404).json({ message: "Client not found" }); // Handle non-existent client
            }

            // Step 2: Create folder structure in Google Drive
            const clientsFolderId = await createFolder("Clients"); // Main "Clients" folder
            const clientFolderName = `${client.name}_${client.contactNumber}`; // Unique folder name
            const clientFolderId = await createFolder(clientFolderName, clientsFolderId); // Client-specific folder

            // Step 3: Upload files to the Google Drive folder
            const uploadedFiles = {}; // Store uploaded file IDs
            for (const [key, file] of Object.entries(files)) {
                if (file) {
                    const fileId = await uploadFileToDrive(clientFolderId, file); // Upload each file
                    uploadedFiles[key] = fileId; // Map field name to file ID
                }
            }

            // Step 4: Update the database with uploaded file information
            client.documents = { ...client.documents, ...uploadedFiles }; // Merge new files with existing documents
            await client.save(); // Save the updated client record

            res.json({ message: "Documents uploaded successfully", uploadedFiles }); // Send success response
        } catch (error) {
            console.error(error); // Log any errors
            res.status(500).json({ message: "Error uploading documents", error }); // Handle errors
        }
    });
};



