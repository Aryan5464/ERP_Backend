// controllers/employeeController.js

const {Employee, TeamLeader, Task} = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');
const { getOrCreateFolder, uploadFileToDrive, getFileLink } = require('../utils/googleDriveServices');
const formidable = require("formidable");
const fs = require("fs/promises");

// Function to create an Employee
const createEmployee = async (req, res) => {
    try {
        const { name, email, teamLeaderIds, phone } = req.body;
        const password = 'mabicons123';

        // Validate input
        if (!name || !email || !teamLeaderIds || !teamLeaderIds.length) {
            return res.status(400).json({ message: 'All required fields are not provided' });
        }

        // Check if the email is already in use
        const existingEmployee = await Employee.findOne({ email });
        if (existingEmployee) {
            return res.status(400).json({ message: 'Email is already taken' });
        }

        // Hash the password
        const hashedPassword = await hashPassword(password);

        // Create a new Employee
        const newEmployee = new Employee({
            name,
            email,
            password: hashedPassword,
            teamLeaders: teamLeaderIds,
            phone
        });

        // Save the Employee
        await newEmployee.save();

        // Update each team leader to add this employee to their `employees` array
        await TeamLeader.updateMany(
            { _id: { $in: teamLeaderIds } },
            { $push: { employees: newEmployee._id } }
        );

        res.status(201).json({
            message: 'Employee created successfully',
            employee: {
                id: newEmployee._id,
                name: newEmployee.name,
                email: newEmployee.email
            }
        });
    } catch (error) {
        console.error('Error creating Employee:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const loginEmployee = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const employee = await Employee.findOne({ email });
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        const isPasswordValid = await comparePasswords(password, employee.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = generateToken({ id: employee._id, email: employee.email, role: 'Employee' });

        res.status(200).json({
            message: 'Login successful',
            token,
            employee: {
                id: employee._id,
                name: employee.name,
                email: employee.email
            }
        });
    } catch (error) {
        console.error('Error logging in Employee:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Function to edit an Employee
const editEmployee = async (req, res) => {
    try {
        const { id, name, password, phone } = req.body;

        if (!id) {
            return res.status(400).json({ message: 'Employee ID is required' });
        }

        const employee = await Employee.findById(id);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        if (name) employee.name = name;
        if (password) employee.password = await hashPassword(password);
        if (phone) employee.phone = phone;

        await employee.save();

        res.status(200).json({
            message: 'Employee updated successfully',
            employee: {
                id: employee._id,
                name: employee.name,
                email: employee.email
            }
        });
    } catch (error) {
        console.error('Error updating Employee:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


// Function to delete an Employee
const deleteEmployee = async (req, res) => {
    try {
        const { employeeId } = req.body;

        if (!employeeId) {
            return res.status(400).json({ message: 'Employee ID is required' });
        }

        // Find the employee to delete
        const employee = await Employee.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // Remove the employee from their team leaders' employee lists
        await TeamLeader.updateMany(
            { employees: employeeId },
            { $pull: { employees: employeeId } }
        );

        // Delete the employee from the database
        await Employee.findByIdAndDelete(employeeId);

        res.status(200).json({ message: 'Employee deleted successfully' });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// controllers/taskController.js
const getEmployeeTasks = async (req, res) => {
    try {
        const { employeeId } = req.body;

        // Check if the employee exists
        const employee = await Employee.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // Fetch tasks where the employee is assigned
        const tasks = await Task.find({
            "assignedEmployees.userType": "Employee",
            "assignedEmployees.userId": employeeId
        }).populate('client', 'name').populate('assignedEmployees.userId', 'name');

        res.status(200).json({
            message: 'Tasks fetched successfully',
            tasks
        });
    } catch (error) {
        console.error('Error fetching tasks for employee:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
 
const uploadEmployeeDP = async (req, res) => {
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
                const employeeFolderId = await getOrCreateFolder("Employee");
                const imageFolderId = await getOrCreateFolder("image", employeeFolderId);
                const fileId = await uploadFileToDrive(imageFolderId, file);

                const { employeeId } = fields;
                if (!employeeId) {
                    return res.status(400).json({ message: "Employee ID is required" });
                }

                const employee = await Employee.findById(employeeId);
                if (!employee) {
                    return res.status(404).json({ message: "Employee not found" });
                }

                employee.dp = fileId;
                await employee.save();

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

const getEmployeeDP = async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (!employeeId) {
            return res.status(400).json({ message: "Employee ID is required" });
        }

        const employee = await Employee.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ message: "Employee not found" });
        }

        if (!employee.dp) {
            return res.status(404).json({ message: "Profile image not found for Employee" });
        }

        const fileLink = await getFileLink(employee.dp);
        if (!fileLink) {
            return res.status(500).json({ message: "Error fetching image link from Google Drive" });
        }

        res.json({
            message: "Profile image retrieved successfully",
            webViewLink: fileLink.webViewLink,
            webContentLink: fileLink.webContentLink,
        });
    } catch (error) {
        console.error("Error fetching Employee profile image:", error);
        res.status(500).json({ message: "Unexpected server error", error });
    }
};
 


module.exports = {
    createEmployee,
    loginEmployee,
    editEmployee,
    deleteEmployee,
    getEmployeeTasks,
    uploadEmployeeDP,
    getEmployeeDP
};
