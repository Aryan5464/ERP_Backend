// controllers/employeeController.js
const {Employee, TeamLeader, Task} = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');
const { getOrCreateFolder, uploadFileToDrive, getFileLink, deleteFile } = require('../utils/googleDriveServices');
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
            'assignedTo.userType': 'Employee',
            'assignedTo.userId': employeeId
        })
        .populate('client', 'name')  // Populate client information
        .populate('assignedTo.userId', 'name')  // Populate assigned user's information
        .populate('parentTaskId')  // Optionally populate parent task if it exists
        .sort({ createdAt: -1 });  // Sort by creation date, newest first

        res.status(200).json({
            success: true,
            message: 'Tasks fetched successfully',
            count: tasks.length,
            tasks
        });

    } catch (error) {
        console.error('Error fetching tasks for employee:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching tasks',
            error: error.message 
        });
    }
};
 

module.exports = {
    createEmployee,
    loginEmployee,
    editEmployee,
    deleteEmployee,
    getEmployeeTasks
};
