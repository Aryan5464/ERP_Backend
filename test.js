// Function to upload a file to Google Drive
const uploadFileToDrive = async (folderId, file) => {
    const fileMetadata = {
        name: file.originalFilename,
        parents: [folderId],
    };

    const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.filepath),
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        media,
        fields: "id",
    });

    return response.data.id;
};

// Function to create or fetch a folder in Google Drive
const getOrCreateFolder = async (name, parentFolderId = null) => {
    let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentFolderId) {
        query += ` and '${parentFolderId}' in parents`;
    }

    const response = await drive.files.list({
        q: query,
        fields: "files(id, name)",
        spaces: "drive",
    });

    if (response.data.files.length > 0) {
        return response.data.files[0].id;
    }

    const folder = await drive.files.create({
        resource: {
            name,
            mimeType: "application/vnd.google-apps.folder",
            parents: parentFolderId ? [parentFolderId] : [],
        },
        fields: "id",
    });

    return folder.data.id;
};

// Endpoint to handle document uploads
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

            // Step 1: Create a folder structure in Google Drive
            const clientsFolderId = await getOrCreateFolder("Clients");
            const clientFolderName = `${client.name}_${client.contactNumber}`;
            const clientFolderId = await getOrCreateFolder(clientFolderName, clientsFolderId);

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
