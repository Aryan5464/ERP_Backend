const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CLIENT_ID = '264377568077-mv41em86lh5r1bd1svoj1i7e1n5pal3l.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'https://developers.google.com/oauthplayground'; // Set during Google Cloud setup
const REFRESH_TOKEN = '1//04tn77xTdHCY9CgYIARAAGAQSNwF-L9IryYtEtzboFvB0rsG4MG7lSmi4wyGgti-rBf3jyC0nqG59Sjq0IdqLRzjjccLr8SYAxNE'; // Obtain this from OAuth2 consent flow

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({
  version: 'v3',
  auth: oauth2Client,
});

// Function to upload a file
const uploadFile = async (filePath, mimeType) => {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: path.basename(filePath), // File name on Google Drive
        mimeType: mimeType,
      },
      media: {
        mimeType: mimeType,
        body: fs.createReadStream(filePath),
      },
    });

    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error uploading the file:', error);
  }
};

// Function to delete a file by ID
const deleteFile = async (fileId) => {
  try {
    await drive.files.delete({
      fileId: fileId,
    });
    console.log('File deleted successfully.');
  } catch (error) {
    console.error('Error deleting the file:', error);
  }
};

// Function to get the public link of a file
const getFileLink = async (fileId) => {
  try {
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
    const result = await drive.files.get({
      fileId: fileId,
      fields: 'webViewLink, webContentLink',
    });
    console.log(result.data);
    return result.data;
  } catch (error) {
    console.error('Error getting file link:', error);
  }
};







module.exports = { uploadFile, deleteFile, getFileLink };