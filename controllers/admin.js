// controllers/adminController.js

const { Admin } = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');
const { getOrCreateFolder, uploadFileToDrive, getFileLink, deleteFile } = require('../utils/googleDriveServices');
const formidable = require("formidable");
const sharp = require("sharp");
const fs = require("fs/promises");
const path = require("path"); // Import the path module


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


// const uploadAdminDP = async (req, res) => {
//     try {
//         const form = new formidable.IncomingForm({
//             multiples: false,
//             keepExtensions: true,
//         });

//         form.parse(req, async (err, fields, files) => {
//             if (err) {
//                 console.error("Form parsing error:", err);
//                 return res.status(500).json({ message: "Error parsing form", error: err });
//             }

//             const fileArray = files.image;
//             const file = Array.isArray(fileArray) ? fileArray[0] : fileArray;

//             if (!file || !file.filepath) {
//                 return res.status(400).json({ message: "Image file is required or invalid" });
//             }

//             try {
//                 const { adminId } = fields;
//                 if (!adminId) {
//                     return res.status(400).json({ message: "Admin ID is required" });
//                 }

//                 const admin = await Admin.findById(adminId);
//                 if (!admin) {
//                     return res.status(404).json({ message: "Admin not found" });
//                 }

//                 // Ensure the uploads directory exists
//                 const uploadsDir = path.join(__dirname, "uploads");
//                 await fs.mkdir(uploadsDir, { recursive: true });

//                 // Compress and save the image
//                 const compressedImagePath = path.join(uploadsDir, `${adminId}_profile.jpg`);

//                 await sharp(file.filepath)
//                     .resize(300, 300, { fit: "cover" }) // Resize to 300x300 (example)
//                     .jpeg({ quality: 80 }) // Compress with 80% quality
//                     .toFile(compressedImagePath);

//                 // Update admin profile picture path
//                 admin.dp = compressedImagePath;
//                 await admin.save();

//                 res.json({
//                     message: "Image uploaded and compressed successfully",
//                     filePath: compressedImagePath,
//                 });
//             } catch (error) {
//                 console.error("Error processing image:", error);
//                 res.status(500).json({ message: "Error processing image", error });
//             } finally {
//                 try {
//                     if (file.filepath) {
//                         await fs.unlink(file.filepath);
//                     }
//                 } catch (cleanupError) {
//                     console.error("Error cleaning up temp file:", cleanupError);
//                 }
//             }
//         });
//     } catch (globalError) {
//         console.error("Unexpected server error:", globalError);
//         res.status(500).json({ message: "Unexpected server error", error: globalError });
//     }
// };


// const getAdminDP = async (req, res) => {
//     try {
//         const { adminId } = req.body;
//         if (!adminId) {
//             return res.status(400).json({ message: "Admin ID is required" });
//         }

//         const admin = await Admin.findById(adminId);
//         if (!admin) {
//             return res.status(404).json({ message: "Admin not found" });
//         }

//         if (!admin.dp) {
//             return res.status(404).json({ message: "Profile image not found for Admin" });
//         }

//         res.sendFile(admin.dp, { root: "." }, (err) => {
//             if (err) {
//                 console.error("Error sending image file:", err);
//                 res.status(500).json({ message: "Error retrieving image file" });
//             }
//         });
//     } catch (error) {
//         console.error("Error fetching Admin profile image:", error);
//         res.status(500).json({ message: "Unexpected server error", error });
//     }
// };

// const deleteAdminDP = async (req, res) => {
//     try {
//         const { adminId } = req.body;
//         if (!adminId) {
//             return res.status(400).json({ message: "Admin ID is required" });
//         }

//         const admin = await Admin.findById(adminId);
//         if (!admin) {
//             return res.status(404).json({ message: "Admin not found" });
//         }

//         if (!admin.dp) {
//             return res.status(404).json({ message: "Profile image not found for Admin" });
//         }

//         try {
//             await fs.unlink(admin.dp);
//         } catch (error) {
//             console.error("Error deleting file:", error);
//             return res.status(500).json({ message: "Error deleting image file", error });
//         }

//         admin.dp = null;
//         await admin.save();

//         res.json({ message: "Admin profile image deleted successfully" });
//     } catch (error) {
//         console.error("Unexpected server error:", error);
//         res.status(500).json({ message: "Unexpected server error", error });
//     }
// };

const uploadAdminDP = async (req, res) => {
    try {
        const form = new formidable.IncomingForm({
            multiples: false,
            keepExtensions: true,
        });

        form.parse(req, async (err, fields, files) => {
            if (err) {
                console.error("Form parsing error:", err);
                return res.status(500).json({ message: "Error parsing form", error: err });
            }

            const fileArray = files.image;
            const file = Array.isArray(fileArray) ? fileArray[0] : fileArray;

            if (!file || !file.filepath) {
                return res.status(400).json({ message: "Image file is required or invalid" });
            }

            try {
                const adminFolderId = await getOrCreateFolder("Admin");
                const imageFolderId = await getOrCreateFolder("image", adminFolderId);
                const fileId = await uploadFileToDrive(imageFolderId, file);

                const { adminId } = fields;
                if (!adminId) {
                    return res.status(400).json({ message: "Admin ID is required" });
                }

                const admin = await Admin.findById(adminId);
                if (!admin) {
                    return res.status(404).json({ message: "Admin not found" });
                }

                admin.dp = fileId;
                await admin.save();

                res.json({
                    message: "Image uploaded successfully",
                    fileId,
                });
            } catch (uploadError) {
                console.error("Error uploading image:", uploadError);
                res.status(500).json({ message: "Error uploading image", error: uploadError });
            } finally {
                try {
                    if (file.filepath) {
                        await fs.unlink(file.filepath);
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

const getAdminDP = async (req, res) => {
    try {
        const { adminId } = req.body;
        if (!adminId) {
            return res.status(400).json({ message: "Admin ID is required" });
        }

        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ message: "Admin not found" });
        }

        if (!admin.dp) {
            return res.status(404).json({ message: "Profile image not found for Admin" });
        }

        const fileLink = await getFileLink(admin.dp);
        if (!fileLink) {
            return res.status(500).json({ message: "Error fetching image link from Google Drive" });
        }

        res.json({
            message: "Profile image retrieved successfully",
            webViewLink: fileLink.webViewLink,
            webContentLink: fileLink.webContentLink,
        });
    } catch (error) {
        console.error("Error fetching Admin profile image:", error);
        res.status(500).json({ message: "Unexpected server error", error });
    }
};

const deleteAdminDP = async (req, res) => {
    try {
        const { adminId } = req.body;
        if (!adminId) {
            return res.status(400).json({ message: "Admin ID is required" });
        }

        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ message: "Admin not found" });
        }

        if (!admin.dp) {
            return res.status(404).json({ message: "Profile image not found for Admin" });
        }

        const fileId = admin.dp;

        try {
            await deleteFile(fileId);
        } catch (error) {
            return res.status(500).json({ message: "Error deleting file from Google Drive", error });
        }

        admin.dp = null;
        await admin.save();

        res.json({ message: "Admin profile image deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Unexpected server error", error });
    }
};


module.exports = {
    createAdmin,
    loginAdmin,
    editAdmin,
    deleteAdmin,
    getAdminHierarchy,
    updateAdminPassword,
    uploadAdminDP,
    getAdminDP,
    deleteAdminDP
};
