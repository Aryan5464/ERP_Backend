// controllers/teamLeaderController.js

const { default: mongoose } = require('mongoose');
const { TeamLeader, Task, Employee, Client } = require('../models/models');
const { Admin } = require('../models/models');
const { hashPassword, comparePasswords } = require('../utils/bcryptUtils');
const { generateToken } = require('../utils/jwtUtils');
const { getOrCreateFolder, uploadFileToDrive, getFileLink, deleteFile } = require('../utils/googleDriveServices');
const formidable = require("formidable");
const fs = require("fs/promises");
const sendEmail = require('../utils/emailService');

// TeamLeader Creation with Email
const createTeamLeader = async (req, res) => {
    try {
        const { name, email, adminId, phone } = req.body;
        const defaultPassword = 'mabicons123';

        // Check if all required fields are present
        if (!name || !email || !adminId) {
            return res.status(400).json({ message: 'All fields are required (name, email, adminId)' });
        }

        // Find the Admin by ID
        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Check if the email is already taken
        const existingTeamLeader = await TeamLeader.findOne({ email });
        if (existingTeamLeader) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        // Hash the password
        const hashedPassword = await hashPassword(defaultPassword);

        // Create the new TeamLeader
        const teamLeader = new TeamLeader({
            name,
            email,
            password: hashedPassword,
            admin: adminId,
            phone
        });

        // Save the TeamLeader
        await teamLeader.save();

        // Update the Admin
        admin.teamLeaders.push(teamLeader._id);
        await admin.save();

        // Send welcome email to team leader
        const emailContent = `
            <h2>Welcome to MabiconsERP!</h2>
            <p>Dear ${name},</p>
            <p>Your Team Leader account has been created successfully. Here are your login credentials:</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Default Password:</strong> ${defaultPassword}</p>
            <p>For security reasons, please change your password after your first login.</p>
            <p>You can access your dashboard at: <a href="[YOUR_DASHBOARD_URL]">[YOUR_DASHBOARD_URL]</a></p>
            <p>As a Team Leader, you will be responsible for:</p>
            <ul>
                <li>Managing your team members</li>
                <li>Overseeing client projects</li>
                <li>Coordinating with other team leaders</li>
            </ul>
            <p>If you have any questions, please contact your admin.</p>
            <p>Best regards,<br>MabiconsERP Team</p>
        `;

        try {
            await sendEmail({
                email: email,
                name: name,
                subject: 'Welcome to MabiconsERP - Team Leader Account Created',
                htmlContent: emailContent
            });
        } catch (emailError) {
            console.error('Error sending team leader welcome email:', emailError);
        }

        res.status(201).json({
            message: 'TeamLeader created successfully',
            teamLeader: {
                id: teamLeader._id,
                name: teamLeader.name,
                email: teamLeader.email,
                phone: teamLeader.phone
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
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { teamLeaderId, newTeamLeaderId } = req.body;

        // Validate ObjectIds
        if (!mongoose.Types.ObjectId.isValid(teamLeaderId) || !mongoose.Types.ObjectId.isValid(newTeamLeaderId)) {
            return res.status(400).json({ message: 'Invalid Team Leader ID format' });
        }

        // Find both team leaders with necessary populated fields
        const [teamLeaderToDelete, newTeamLeader] = await Promise.all([
            TeamLeader.findById(teamLeaderId).populate('admin'),
            TeamLeader.findById(newTeamLeaderId)
        ]);

        // Validations
        if (!teamLeaderToDelete || !newTeamLeader) {
            return res.status(404).json({ message: 'One or both team leaders not found' });
        }

        if (teamLeaderId === newTeamLeaderId) {
            return res.status(400).json({ message: 'Cannot reassign to the same team leader' });
        }

        // Update Admin's references
        await Admin.findByIdAndUpdate(
            teamLeaderToDelete.admin,
            { $pull: { teamLeaders: teamLeaderId } },
            { session }
        );

        // First, get all employees that need to be updated
        const employeesToUpdate = await Employee.find({ teamLeaders: teamLeaderId });

        // Update each employee's teamLeaders array separately
        for (const employee of employeesToUpdate) {
            // Remove old team leader
            await Employee.findByIdAndUpdate(
                employee._id,
                { $pull: { teamLeaders: teamLeaderId } },
                { session }
            );

            // Add new team leader (if not already present)
            await Employee.findByIdAndUpdate(
                employee._id,
                { $addToSet: { teamLeaders: newTeamLeaderId } },
                { session }
            );
        }

        // Transfer Tasks
        await Task.updateMany(
            { teamLeader: teamLeaderId },
            { 
                $set: { teamLeader: newTeamLeaderId },
                $push: {
                    history: {
                        action: 'Team Leader Reassignment',
                        from: teamLeaderId,
                        to: newTeamLeaderId,
                        date: new Date()
                    }
                }
            },
            { session }
        );

        // Update task assignments
        await Task.updateMany(
            { "assignedEmployees.userType": "TeamLeader", "assignedEmployees.userId": teamLeaderId },
            { 
                $set: { "assignedEmployees.$.userId": newTeamLeaderId }
            },
            { session }
        );

        // Transfer Clients
        await Client.updateMany(
            { teamLeader: teamLeaderId },
            { $set: { teamLeader: newTeamLeaderId } },
            { session }
        );

        // Update new team leader's references
        const updatedTeamLeader = await TeamLeader.findByIdAndUpdate(
            newTeamLeaderId,
            {
                $addToSet: {
                    employees: { $each: teamLeaderToDelete.employees || [] },
                    tasks: { $each: teamLeaderToDelete.tasks || [] },
                    clients: { $each: teamLeaderToDelete.clients || [] }
                }
            },
            { session, new: true }
        );

        // Delete the old team leader
        await TeamLeader.findByIdAndDelete(teamLeaderId, { session });

        // Send notifications
        try {
            // Notify new team leader
            await sendEmail({
                email: newTeamLeader.email,
                name: newTeamLeader.name,
                subject: 'Team Reassignment Notification',
                htmlContent: `
                    <h2>Team Reassignment Notice</h2>
                    <p>You have been assigned the team and responsibilities of ${teamLeaderToDelete.name}.</p>
                    <p>Please review your dashboard for updated team members and tasks.</p>
                `
            });

            // Notify affected employees
            for (const employee of employeesToUpdate) {
                await sendEmail({
                    email: employee.email,
                    name: employee.name,
                    subject: 'Team Leader Change Notification',
                    htmlContent: `
                        <h2>Team Leader Change Notice</h2>
                        <p>Your new team leader is ${newTeamLeader.name}.</p>
                        <p>Please reach out to them for any assistance or queries.</p>
                    `
                });
            }
        } catch (emailError) {
            console.error('Error sending notification emails:', emailError);
            // Continue with the process even if emails fail
        }

        await session.commitTransaction();

        res.status(200).json({
            message: 'Team Leader deleted and reassigned successfully',
            newTeamLeader: {
                id: updatedTeamLeader._id,
                name: updatedTeamLeader.name,
                email: updatedTeamLeader.email
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error in team leader reassignment:', error);
        res.status(500).json({ 
            message: 'Server error during reassignment',
            error: error.message 
        });
    } finally {
        session.endSession();
    }
};


// Function to delete team leader and promote an employee to a new team leader
const deleteTeamLeaderAndPromoteEmployee = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { oldTeamLeaderId, employeeToPromoteId } = req.body;

        // Validate inputs and fetch necessary documents
        const [oldTeamLeader, employeeToPromote] = await Promise.all([
            TeamLeader.findById(oldTeamLeaderId).populate('admin'),
            Employee.findById(employeeToPromoteId)
        ]);

        if (!oldTeamLeader || !employeeToPromote) {
            return res.status(404).json({ message: 'Team leader or employee not found' });
        }

        // Create new team leader from employee
        const newTeamLeader = new TeamLeader({
            name: employeeToPromote.name,
            email: employeeToPromote.email,
            phone: employeeToPromote.phone,
            password: employeeToPromote.password, // Maintain the same password
            admin: oldTeamLeader.admin,
            employees: oldTeamLeader.employees,
            tasks: oldTeamLeader.tasks,
            clients: oldTeamLeader.clients
        });

        await newTeamLeader.save({ session });

        // Update Admin's references
        await Admin.findByIdAndUpdate(
            oldTeamLeader.admin,
            {
                $pull: { teamLeaders: oldTeamLeaderId },
                $push: { teamLeaders: newTeamLeader._id }
            },
            { session }
        );

        // Update Employee references
        await Employee.updateMany(
            { teamLeaders: oldTeamLeaderId },
            {
                $pull: { teamLeaders: oldTeamLeaderId },
                $push: { teamLeaders: newTeamLeader._id }
            },
            { session }
        );

        // Update Tasks
        await Task.updateMany(
            { teamLeader: oldTeamLeaderId },
            { 
                $set: { teamLeader: newTeamLeader._id },
                $push: {
                    history: {
                        action: 'Team Leader Promotion',
                        from: oldTeamLeaderId,
                        to: newTeamLeader._id,
                        date: new Date()
                    }
                }
            },
            { session }
        );

        // Update Clients
        await Client.updateMany(
            { teamLeader: oldTeamLeaderId },
            { $set: { teamLeader: newTeamLeader._id } },
            { session }
        );

        // Delete the old team leader and employee records
        await Promise.all([
            TeamLeader.findByIdAndDelete(oldTeamLeaderId, { session }),
            Employee.findByIdAndDelete(employeeToPromoteId, { session })
        ]);

        // Send notifications
        try {
            // Notify the promoted employee
            await sendEmail({
                email: employeeToPromote.email,
                name: employeeToPromote.name,
                subject: 'Promotion to Team Leader',
                htmlContent: `
                    <h2>Congratulations on Your Promotion!</h2>
                    <p>You have been promoted to Team Leader.</p>
                    <p>Your team leader dashboard is now available with all necessary tools and information.</p>
                    <p>Please log in to review your new responsibilities and team members.</p>
                `
            });

            // Notify team members
            const teamMembers = await Employee.find({ teamLeaders: oldTeamLeaderId });
            for (const member of teamMembers) {
                await sendEmail({
                    email: member.email,
                    name: member.name,
                    subject: 'New Team Leader Announcement',
                    htmlContent: `
                        <h2>Team Leader Update</h2>
                        <p>${employeeToPromote.name} has been promoted to Team Leader.</p>
                        <p>Please congratulate them on their new role.</p>
                    `
                });
            }
        } catch (emailError) {
            console.error('Error sending notification emails:', emailError);
        }

        await session.commitTransaction();

        res.status(200).json({
            message: 'Team leader successfully deleted and employee promoted',
            newTeamLeader: {
                id: newTeamLeader._id,
                name: newTeamLeader.name,
                email: newTeamLeader.email
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error in promotion process:', error);
        res.status(500).json({ message: 'Server error during promotion process' });
    } finally {
        session.endSession();
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


const getTeamLeaderDetails = async (req, res) => {
    try {
        const { teamLeaderId } = req.body;

        // Validate the teamLeaderId
        if (!teamLeaderId) {
            return res.status(400).json({ message: 'Team Leader ID is required.' });
        }

        // Find the Team Leader and populate the relevant details
        const teamLeader = await TeamLeader.findById(teamLeaderId)
            .populate({
                path: 'tasks',
                select: 'title description status category dueDate frequency priority client assignedTo', // Select all important fields
                populate: [
                    { path: 'client', select: 'name email companyName' }, // Populate client details in tasks
                    { path: 'assignedTo.userId', select: 'name email' }, // Populate assigned user details
                ],
            })
            .populate('employees', 'name email phone') // Populate employees under the team leader
            .populate('clients', 'name email companyName') // Populate clients associated with the team leader
            .populate('admin', 'name email'); // Populate admin details if required

        // If no Team Leader found, return 404
        if (!teamLeader) {
            return res.status(404).json({ message: 'Team Leader not found.' });
        }

        // Send the team leader details
        res.status(200).json({
            message: 'Team Leader details fetched successfully.',
            teamLeader,
        });
    } catch (error) {
        console.error('Error fetching Team Leader details:', error);
        res.status(500).json({ message: 'Server error while fetching Team Leader details.', error: error.message });
    }
};

module.exports = {
    createTeamLeader,
    loginTeamLeader,
    editTeamLeader,
    deleteTeamLeaderWithReassignment,
    deleteTeamLeaderAndPromoteEmployee,
    getTeamLeaderHierarchy,
    getTeamLeaderTasks,
    getTeamLeaderDetails
};
