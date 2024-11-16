// controllers/employeeController.js

const {Employee, TeamLeader} = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');

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
        const { employeeID } = req.body;

        if (!employeeID) {
            return res.status(400).json({ message: 'Employee ID is required' });
        }

        const employee = await Employee.findById(employeeID);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        await Employee.findByIdAndDelete(employeeID);

        res.status(200).json({ message: 'Employee deleted successfully' });
    } catch (error) {
        console.error('Error deleting Employee:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const promoteEmployeeToTeamLeader = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { employeeId, adminId } = req.body;

        if (!employeeId || !adminId) {
            return res.status(400).json({ message: 'Employee ID and Admin ID are required' });
        }

        const employee = await Employee.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        const teamLeaderData = {
            name: employee.name,
            email: employee.email,
            password: employee.password,
            admin: adminId,
            employees: [], // Initialize with an empty array, can be modified later
            phone: employee.phone || null, // Include phone if it exists in Employee
        };

        // Create new Team Leader from Employee data
        const newTeamLeader = new TeamLeader(teamLeaderData);
        await newTeamLeader.save({ session });

        // Delete the Employee after successful Team Leader creation
        await Employee.findByIdAndDelete(employeeId, { session });

        // Commit the transaction
        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: 'Employee promoted to Team Leader successfully',
            teamLeader: newTeamLeader,
        });
    } catch (error) {
        // Abort transaction on any error
        await session.abortTransaction();
        session.endSession();

        console.error('Error promoting Employee to Team Leader:', error);
        res.status(500).json({ message: 'Failed to promote Employee to Team Leader' });
    }
};


module.exports = {
    createEmployee,
    loginEmployee,
    editEmployee,
    deleteEmployee,
    promoteEmployeeToTeamLeader
};
