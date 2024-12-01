// controllers/superAdminController.js

const { SuperAdmin } = require('../models/models');
const { comparePasswords, hashPassword } = require('../utils/bcryptUtils');
const { getOrCreateFolder, uploadFileToDrive, getFileLink } = require('../utils/googleDriveServices');
const { generateToken } = require('../utils/jwtUtils');
const formidable = require("formidable");
const fs = require("fs/promises");

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

const uploadSuperAdminDP = async (req, res) => {
    try {
        // Create a Formidable form instance for parsing the request
        const form = new formidable.IncomingForm({
            multiples: false, // Only a single file is expected
            keepExtensions: true, // Retain file extension
        });

        // Parse the incoming form
        form.parse(req, async (err, fields, files) => {
            if (err) {
                console.error("Form parsing error:", err);
                return res.status(500).json({ message: "Error parsing form", error: err });
            }

            // console.log("Parsed Fields:", fields); // Debug fields (if any)
            // console.log("Parsed Files:", files);   // Debug file details

            // Handle the case where files.image is an array
            const fileArray = files.image;
            const file = Array.isArray(fileArray) ? fileArray[0] : fileArray;

            if (!file || !file.filepath) {
                return res.status(400).json({ message: "Image file is required or invalid" });
            }

            try {
                // Ensure the Google Drive folder structure
                const superAdminFolderId = await getOrCreateFolder("SuperAdmin");
                const imageFolderId = await getOrCreateFolder("image", superAdminFolderId);

                // Upload the image to Google Drive
                const fileId = await uploadFileToDrive(imageFolderId, file);

                // Extract the SuperAdmin ID from the request body
                const { superAdminId } = fields;
                if (!superAdminId) {
                    return res.status(400).json({ message: "SuperAdmin ID is required" });
                }

                // Find and update the SuperAdmin in the database
                const superAdmin = await SuperAdmin.findById(superAdminId);
                if (!superAdmin) {
                    return res.status(404).json({ message: "SuperAdmin not found" });
                }

                superAdmin.dp = fileId; // Update the 'dp' field with the Google Drive file ID
                await superAdmin.save();

                // Send success response
                res.json({
                    message: "Image uploaded successfully",
                    fileId,
                });
            } catch (uploadError) {
                console.error("Error uploading image:", uploadError);
                res.status(500).json({ message: "Error uploading image", error: uploadError });
            } finally {
                // Clean up the temporary file
                try {
                    if (file.filepath) {
                        await fs.unlink(file.filepath); // Delete the local temp file
                    }
                } catch (cleanupError) {
                    console.error("Error cleaning up temp file:", cleanupError);
                }
            }
        });
    } catch (globalError) {
        console.error("Unexpected server error:", globalError);
        res.status(500).json({ message: "Unexpected server error", error: globalError });
    }
};

const getSuperAdminDP = async (req, res) => {
    try {
        const { superAdminId } = req.body; // Extract ID from the request body
        if (!superAdminId) {
            return res.status(400).json({ message: "SuperAdmin ID is required" });
        }

        // Fetch the SuperAdmin document from the database
        const superAdmin = await SuperAdmin.findById(superAdminId);
        if (!superAdmin) {
            return res.status(404).json({ message: "SuperAdmin not found" });
        }

        // Check if the profile image (dp) exists
        if (!superAdmin.dp) {
            return res.status(404).json({ message: "Profile image not found for SuperAdmin" });
        }

        // Get the public link from Google Drive
        const fileLink = await getFileLink(superAdmin.dp);
        if (!fileLink) {
            return res.status(500).json({ message: "Error fetching image link from Google Drive" });
        }

        res.json({
            message: "Profile image retrieved successfully",
            webViewLink: fileLink.webViewLink,
            webContentLink: fileLink.webContentLink,
        });
    } catch (error) {
        console.error("Error fetching SuperAdmin profile image:", error);
        res.status(500).json({ message: "Unexpected server error", error });
    }
};

module.exports = {
    loginSuperAdmin,
    editSuperAdmin,
    uploadSuperAdminDP,
    getSuperAdminDP
};
