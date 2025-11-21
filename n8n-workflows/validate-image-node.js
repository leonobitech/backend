// Validate image
const item = items[0];

// Get data from the Webhook node
const webhookNode = $node["Webhook - Upload Avatar"].json;
const webhookData = webhookNode.body;

// Extract user data
const userId = webhookData.userId;
const filename = webhookData.filename || 'avatar.jpg';
const mimeType = webhookData.mimeType || 'image/jpeg';

// Validate MIME type
const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
if (!allowedTypes.includes(mimeType)) {
  throw new Error(`Invalid file type: ${mimeType}. Allowed: ${allowedTypes.join(', ')}`);
}

// Validate file size (5MB max)
const maxSize = 5 * 1024 * 1024; // 5MB
if (item.binary && item.binary.data) {
  const fileSize = item.binary.data.data.length;
  if (fileSize > maxSize) {
    throw new Error('File size exceeds 5MB limit');
  }
}

return {
  json: {
    user_id: userId,  // Match Baserow field name
    filename: filename,
    mimeType: mimeType,
    validated: true
  },
  binary: item.binary
};
