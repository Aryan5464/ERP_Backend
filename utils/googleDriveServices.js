// In googleDriveServices.js
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { Readable } = require('stream');

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

const updateFilePermissions = async (fileId, role = 'reader', type = 'anyone') => {
  try {
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: role,
        type: type,
      },
    });
    return true;
  } catch (error) {
    console.error('Error updating file permissions:', error);
    throw error;
  }
};

const uploadFile = async (fileObject) => {
  try {
      // Validate file object
      if (!fileObject || !fileObject.buffer) {
          throw new Error('Invalid file object');
      }

      // Define allowed file types and size limit
      const allowedMimeTypes = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/jpeg',
          'image/png',
          'image/jpg',
          'text/plain',
          'application/zip',
          'application/x-zip-compressed'
      ];

      const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB in bytes

      // Validate file type
      if (!allowedMimeTypes.includes(fileObject.mimetype)) {
          throw new Error('File type not supported. Allowed types: PDF, Word, Excel, Images, Text, ZIP');
      }

      // Validate file size
      if (fileObject.size > MAX_FILE_SIZE) {
          throw new Error('File size exceeds limit of 15MB');
      }

      // Create a safe filename
      const safeFileName = `${Date.now()}-${path.basename(fileObject.originalname).replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      // Create readable stream from buffer
      const bufferStream = new Readable();
      bufferStream.push(fileObject.buffer);
      bufferStream.push(null); // Signal the end of the stream

      // Prepare file metadata
      const fileMetadata = {
          name: safeFileName,
          parents: [process.env.GOOGLE_DRIVE_FOLDER_ID], // Use environment variable
          description: `Uploaded via Chat on ${new Date().toLocaleString()}`
      };

      // Upload file to Google Drive
      const { data } = await drive.files.create({
          media: {
              mimeType: fileObject.mimetype,
              body: bufferStream,
          },
          requestBody: fileMetadata,
          fields: 'id, name, mimeType, webViewLink, size, thumbnailLink, createdTime',
      }, {
          // Optional: Add timeout and retry options
          timeout: 10000, // 10 seconds
          retry: true,
          retries: 3
      });

      // Set file permissions (public read access)
      await drive.permissions.create({
          fileId: data.id,
          requestBody: {
              role: 'reader',
              type: 'anyone',
          },
      });

      // Format file size
      const formattedSize = formatFileSize(parseInt(data.size));

      // Get file icon/thumbnail if available
      let thumbnailUrl = null;
      if (data.thumbnailLink) {
          thumbnailUrl = data.thumbnailLink;
      }

      // Return enhanced file details
      return {
          fileId: data.id,
          fileName: data.name,
          originalName: fileObject.originalname,
          fileType: data.mimeType,
          webViewLink: data.webViewLink,
          downloadLink: `https://drive.google.com/uc?export=download&id=${data.id}`,
          fileSize: parseInt(data.size),
          formattedSize: formattedSize,
          thumbnailUrl: thumbnailUrl,
          uploadDate: data.createdTime,
          mimeType: fileObject.mimetype
      };

  } catch (error) {
      console.error('Error uploading to Google Drive:', error);
      
      // Enhanced error handling
      let errorMessage = 'Failed to upload file';
      if (error.message.includes('quota')) {
          errorMessage = 'Storage quota exceeded';
      } else if (error.message.includes('File type')) {
          errorMessage = error.message;
      } else if (error.message.includes('size')) {
          errorMessage = error.message;
      } else if (error.code === 403) {
          errorMessage = 'Permission denied to access Google Drive';
      } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          errorMessage = 'Connection error. Please try again';
      }

      throw new Error(errorMessage);
  }
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};



// Helper function to get file extension
const getFileExtension = (filename) => {
    return path.extname(filename).toLowerCase();
};

// Helper function to check if file is an image
const isImage = (mimeType) => {
    return mimeType.startsWith('image/');
};

module.exports = {
  drive,
  getOrCreateFolder,
  updateFilePermissions,
  uploadFile
};




// const uploadFile = async (filePath, mimeType) => {
//   try {
//       if (!fs.existsSync(filePath)) {
//           throw new Error('File does not exist');
//       }

//       const response = await drive.files.create({
//           requestBody: {
//               name: path.basename(filePath),
//               mimeType: mimeType,
//           },
//           media: {
//               mimeType: mimeType,
//               body: fs.createReadStream(filePath),
//           },
//       });

//       return response.data;
//   } catch (error) {
//       console.error('Error uploading file:', error.message);
//       throw error;
//   }
// };

// const deleteFile = async (fileId) => {
//   try {
//       await drive.files.delete({ fileId });
//       return true;
//   } catch (error) {
//       console.error('Error deleting file:', error.message);
//       throw error;
//   }
// };

// const getFileLink = async (fileId) => {
//   try {
//       // Set file permissions to public
//       await drive.permissions.create({
//           fileId: fileId,
//           requestBody: {
//               role: 'reader',
//               type: 'anyone',
//           },
//       });

//       // Get file links
//       const result = await drive.files.get({
//           fileId: fileId,
//           fields: 'webViewLink, webContentLink, id',
//       });

//       return {
//           webViewLink: result.data.webViewLink,
//           webContentLink: result.data.webContentLink,
//           directLink: `https://drive.google.com/uc?id=${result.data.id}`,
//       };
//   } catch (error) {
//       console.error('Error getting file links:', error.message);
//       throw error;
//   }
// };

// const uploadFileToDrive = async (folderId, file) => {
//   try {
//       if (!file || !file.filepath) {
//           throw new Error('Invalid file object');
//       }

//       const fileMetadata = {
//           name: file.originalFilename || 'unnamed-file',
//           parents: [folderId],
//       };

//       const media = {
//           mimeType: file.mimetype,
//           body: fs.createReadStream(file.filepath),
//       };

//       const response = await drive.files.create({
//           resource: fileMetadata,
//           media,
//           fields: 'id',
//       });

//       return response.data.id;
//   } catch (error) {
//       console.error('Error uploading file to drive:', error.message);
//       throw error;
//   }
// };
