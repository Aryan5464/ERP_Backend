const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Configuration object
const config = {
  CLIENT_ID: '264377568077-mv41em86lh5r1bd1svoj1i7e1n5pal3l.apps.googleusercontent.com',
  CLIENT_SECRET: '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',
  REDIRECT_URI: 'https://developers.google.com/oauthplayground',
  REFRESH_TOKEN: '1//04kyqmxiYNRQLCgYIARAAGAQSNwF-L9Iru3lC8MsLeH0iTyZ32dM-8pxKJ-fyjhjDXIY-HNhCzAvt0L_xRdnL66KtbxQSjRWYft4'
};

// Initialize Google Drive API
const initializeDrive = () => {
  const oauth2Client = new google.auth.OAuth2(
    config.CLIENT_ID,
    config.CLIENT_SECRET,
    config.REDIRECT_URI
  );

  oauth2Client.setCredentials({ refresh_token: config.REFRESH_TOKEN });

  return google.drive({
    version: 'v3',
    auth: oauth2Client,
  });
};

const drive = initializeDrive();

const uploadFile = async (filePath, mimeType) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File does not exist');
    }

    const response = await drive.files.create({
      requestBody: {
        name: path.basename(filePath),
        mimeType: mimeType,
      },
      media: {
        mimeType: mimeType,
        body: fs.createReadStream(filePath),
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error.message);
    throw error;
  }
};

const deleteFile = async (fileId) => {
  try {
    await drive.files.delete({ fileId });
    return true;
  } catch (error) {
    console.error('Error deleting file:', error.message);
    throw error;
  }
};

const getFileLink = async (fileId) => {
  try {
    // Set file permissions to public
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // Get file links
    const result = await drive.files.get({
      fileId: fileId,
      fields: 'webViewLink, webContentLink, id',
    });

    return {
      webViewLink: result.data.webViewLink,
      webContentLink: result.data.webContentLink,
      directLink: `https://drive.google.com/uc?id=${result.data.id}`,
    };
  } catch (error) {
    console.error('Error getting file links:', error.message);
    throw error;
  }
};

const uploadFileToDrive = async (folderId, file) => {
  try {
    if (!file || !file.filepath) {
      throw new Error('Invalid file object');
    }

    const fileMetadata = {
      name: file.originalFilename || 'unnamed-file',
      parents: [folderId],
    };

    const media = {
      mimeType: file.mimetype,
      body: fs.createReadStream(file.filepath),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id',
    });

    return response.data.id;
  } catch (error) {
    console.error('Error uploading file to drive:', error.message);
    throw error;
  }
};


// Helper function to get or create folder
const getOrCreateFolder = async (name, parentFolderId = null) => {
  try {
    let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    const folder = await drive.files.create({
      resource: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : [],
      },
      fields: 'id',
    });

    return folder.data.id;
  } catch (error) {
    console.error('Error in getOrCreateFolder:', error);
    throw new Error(`Failed to setup folder: ${error.message}`);
  }
};


module.exports = {
  drive,
  uploadFile,
  deleteFile,
  getFileLink,
  uploadFileToDrive,
  getOrCreateFolder,
};