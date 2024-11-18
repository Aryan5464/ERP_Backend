// controllers/teamLeaderController.js

const { default: mongoose } = require('mongoose');
const {TeamLeader, Task, Employee, Client } = require('../models/models');
const {Admin} = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');

// Function to create a new TeamLeader
const createTeamLeader = async (req, res) => {
    try {
        const { name, email, adminId, phone } = req.body; // Including phone number
        const password = 'mabicons123'

        // Check if all required fields are present
        if (!name || !email || !adminId) {
            return res.status(400).json({ message: 'All fields are required (name, email, password, adminId)' });
        }

        // Find the Admin by ID
        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Check if the email is already taken by another TeamLeader
        const existingTeamLeader = await TeamLeader.findOne({ email });
        if (existingTeamLeader) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        // Hash the password before saving
        const hashedPassword = await hashPassword(password);

        // Create the new TeamLeader
        const teamLeader = new TeamLeader({
            name,
            email,
            password: hashedPassword,
            admin: adminId,
            phone // Save phone number if provided
        });

        // Save the TeamLeader to the database
        await teamLeader.save();

        // Update the Admin to add the new TeamLeader reference
        admin.teamLeaders.push(teamLeader._id);
        await admin.save();

        res.status(201).json({
            message: 'TeamLeader created successfully',
            teamLeader: {
                id: teamLeader._id,
                name: teamLeader.name,
                email: teamLeader.email,
                phone: teamLeader.phone // Include phone in response
            }
        });
    } catch (error) {
        console.error('Error creating TeamLeader:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const loginTeamLeader = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const teamLeader = await TeamLeader.findOne({ email });
        if (!teamLeader) {
            return res.status(404).json({ message: 'Team Leader not found' });
        }

        const isPasswordValid = await comparePasswords(password, teamLeader.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = generateToken({ id: teamLeader._id, email: teamLeader.email, role: 'TeamLeader' });

        res.status(200).json({
            message: 'Login successful',
            token,
            teamLeader: {
                id: teamLeader._id,
                name: teamLeader.name,
                email: teamLeader.email
            }
        });
    } catch (error) {
        console.error('Error logging in Team Leader:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Function to edit an existing TeamLeader
const editTeamLeader = async (req, res) => {
    try {
        const { id, name, phone, password } = req.body; // TeamLeader details

        // Check if the TeamLeader ID is provided
        if (!id) {
            return res.status(400).json({ message: 'TeamLeader ID is required' });
        }

        // Find the TeamLeader by ID
        const teamLeader = await TeamLeader.findById(id);
        if (!teamLeader) {
            return res.status(404).json({ message: 'TeamLeader not found' });
        }

        // Update TeamLeader fields if they are provided
        if (name) teamLeader.name = name;
        if (phone) teamLeader.phone = phone;
        if (password) {
            // Hash the new password before saving
            teamLeader.password = await hashPassword(password);
        }

        // Save the updated TeamLeader
        await teamLeader.save();

        res.status(200).json({
            message: 'TeamLeader updated successfully',
            teamLeader: {
                id: teamLeader._id,
                name: teamLeader.name,
                email: teamLeader.email,
                phone: teamLeader.phone
            }
        });
    } catch (error) {
        console.error('Error updating TeamLeader:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const deleteTeamLeaderWithReassignment = async (req, res) => {
    try {
        const { teamLeaderId, newTeamLeaderId } = req.body;

        // Validate ObjectIds
        if (!mongoose.Types.ObjectId.isValid(teamLeaderId) || !mongoose.Types.ObjectId.isValid(newTeamLeaderId)) {
            return res.status(400).json({ message: 'Invalid Team Leader ID format' });
        }

        // Prevent reassigning to the same team leader
        if (teamLeaderId === newTeamLeaderId) {
            return res.status(400).json({ message: 'New Team Leader ID must be different from the existing Team Leader ID' });
        }

        // Check if the team leader to delete exists
        const teamLeaderToDelete = await TeamLeader.findById(teamLeaderId);
        if (!teamLeaderToDelete) {
            return res.status(404).json({ message: 'Team Leader to delete not found' });
        }

        // Check if the new team leader exists
        const newTeamLeader = await TeamLeader.findById(newTeamLeaderId);
        if (!newTeamLeader) {
            return res.status(404).json({ message: 'New Team Leader not found' });
        }

        // Step 1: Remove the old team leader from each employee's teamLeaders array
        await Employee.updateMany(
            { teamLeaders: teamLeaderId },
            { $pull: { teamLeaders: teamLeaderId } }
        );

        // Step 2: Add the new team leader to each relevant employee's teamLeaders array
        await Employee.updateMany(
            { teamLeaders: { $ne: newTeamLeaderId }, _id: { $in: teamLeaderToDelete.employees } },
            { $addToSet: { teamLeaders: newTeamLeaderId } }
        );

        // Step 3: Update the employees array in the new team leader
        const employeesToTransfer = teamLeaderToDelete.employees;
        await TeamLeader.findByIdAndUpdate(newTeamLeaderId, {
            $addToSet: { employees: { $each: employeesToTransfer } }
        });

        // Step 4: Reassign tasks to the new team leader and update the tasks array of the new team leader
        const tasksToTransfer = await Task.find({ teamLeader: teamLeaderId });
        
        // Set the new team leader on each of the tasks and save
        await Task.updateMany(
            { teamLeader: teamLeaderId },
            { $set: { teamLeader: newTeamLeaderId } }
        );

        // Add these tasks to the tasks array in new team leader
        const taskIds = tasksToTransfer.map(task => task._id);
        await TeamLeader.findByIdAndUpdate(newTeamLeaderId, {
            $addToSet: { tasks: { $each: taskIds } }
        });

        // Step 5: Update tasks where the deleted team leader was an assigned employee
        await Task.updateMany(
            { "assignedEmployees.userType": "TeamLeader", "assignedEmployees.userId": teamLeaderId },
            { $set: { "assignedEmployees.$[elem].userId": newTeamLeaderId } },
            { arrayFilters: [{ "elem.userId": teamLeaderId }] }
        );

        // Step 6: Reassign clients to the new team leader
        await Client.updateMany(
            { teamLeader: teamLeaderId },
            { $set: { teamLeader: newTeamLeaderId } }
        );

        // Step 7: Delete the old team leader
        await TeamLeader.findByIdAndDelete(teamLeaderId);

        res.status(200).json({ message: 'Team Leader deleted and employees, clients, and tasks reassigned successfully' });
    } catch (error) {
        console.error('Error deleting team leader:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


// Function to delete team leader and promote an employee to a new team leader
const deleteTeamLeaderAndPromoteEmployee = async (req, res) => {
    try {
        const { oldTeamLeaderId, employeeToPromoteId } = req.body;

        // Step 1: Validate inputs
        if (!oldTeamLeaderId || !employeeToPromoteId) {
            return res.status(400).json({ message: 'Both old team leader ID and employee to promote ID are required.' });
        }

        // Step 2: Find old team leader and employee to promote
        const oldTeamLeader = await TeamLeader.findById(oldTeamLeaderId).populate('employees').populate('tasks');
        const employeeToPromote = await Employee.findById(employeeToPromoteId);

        if (!oldTeamLeader || !employeeToPromote) {
            return res.status(404).json({ message: 'Old team leader or employee to promote not found.' });
        }

        // Step 3: Remove the old team leader from employees' teamLeaders array
        for (let employeeId of oldTeamLeader.employees) {
            await Employee.findByIdAndUpdate(employeeId, {
                $pull: { teamLeaders: oldTeamLeaderId } // Remove the old team leader reference
            });
        }

        // Step 4: Add the new team leader (promoted employee) to the employees' teamLeaders array
        for (let employeeId of oldTeamLeader.employees) {
            await Employee.findByIdAndUpdate(employeeId, {
                $push: { teamLeaders: employeeToPromoteId } // Add the new team leader reference
            });
        }

        // Step 5: Reassign tasks from old team leader to the promoted employee
        for (let taskId of oldTeamLeader.tasks) {
            const task = await Task.findById(taskId);
            if (task) {
                task.teamLeader = employeeToPromoteId; // Reassign task to the new team leader
                await task.save();
            }
        }

        // Step 6: Update clients with the new team leader
        await Client.updateMany(
            { teamLeader: oldTeamLeaderId },
            { $set: { teamLeader: employeeToPromoteId } }
        );

        // Step 7: Delete the old team leader
        await TeamLeader.findByIdAndDelete(oldTeamLeaderId);

        // Step 8: Update the employee's role to 'TeamLeader'
        employeeToPromote.role = 'TeamLeader';  // Assuming you have a role field in the Employee model
        await employeeToPromote.save();

        // Step 9: Create a new TeamLeader document for the promoted employee
        const newTeamLeader = new TeamLeader({
            name: employeeToPromote.name,
            email: employeeToPromote.email,
            phone: employeeToPromote.phone,
            admin: employeeToPromote.admin, // Assuming admin field is the same as employee's admin
            employees: oldTeamLeader.employees, // Reassign employees
            tasks: oldTeamLeader.tasks, // Reassign tasks
        });

        // Save the new team leader
        await newTeamLeader.save();

        res.status(200).json({ message: 'Team leader successfully deleted and employee promoted.' });
    } catch (error) {
        console.error('Error deleting team leader and promoting employee:', error);
        res.status(500).json({ message: 'An error occurred while deleting the team leader and promoting the employee.' });
    }
};


const getTeamLeaderHierarchy = async (req, res) => {
    try {
        const { teamLeaderId } = req.body;

        // Validate input
        if (!teamLeaderId) {
            return res.status(400).json({ message: 'Team Leader ID is required' });
        }

        // Find the team leader and populate the employees array
        const teamLeader = await TeamLeader.findById(teamLeaderId)
            .populate('employees', 'name email phone') // Populate employee details
            .select('name email employees'); // Only select necessary fields for the response

        // Check if the team leader was found
        if (!teamLeader) {
            return res.status(404).json({ message: 'Team Leader not found' });
        }

        res.status(200).json({
            message: 'Team Leader hierarchy retrieved successfully',
            teamLeader: {
                id: teamLeader._id,
                name: teamLeader.name,
                email: teamLeader.email,
                employees: teamLeader.employees
            }
        });
    } catch (error) {
        console.error('Error retrieving Team Leader hierarchy:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const getTeamLeaderTasks = async (req, res) => {
    try {
        const { teamLeaderId } = req.body;

        // Check if the team leader exists
        const teamLeader = await TeamLeader.findById(teamLeaderId);
        if (!teamLeader) {
            return res.status(404).json({ message: 'Team Leader not found' });
        }

        // Fetch tasks where the team leader is directly responsible or assigned
        const tasks = await Task.find({
            $or: [
                { teamLeader: teamLeaderId },
                { "assignedEmployees.userType": "TeamLeader", "assignedEmployees.userId": teamLeaderId }
            ]
        }).populate('client', 'name').populate('assignedEmployees.userId', 'name');

        res.status(200).json({
            message: 'Tasks fetched successfully',
            tasks
        });
    } catch (error) {
        console.error('Error fetching tasks for team leader:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


module.exports = {
    createTeamLeader,
    loginTeamLeader,
    editTeamLeader,
    deleteTeamLeaderWithReassignment, 
    deleteTeamLeaderAndPromoteEmployee,
    getTeamLeaderHierarchy, 
    getTeamLeaderTasks
};
