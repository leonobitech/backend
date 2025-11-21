// Upload avatar to Baserow in a single Function node
// This wraps both API calls (upload file + create row)

const axios = require('axios');
const FormData = require('form-data');

const item = items[0];
const BASEROW_TOKEN = 'hRyhpz42krDurs1fPxLDK09Ypn1keySq';
const BASEROW_API = 'https://br.leonobitech.com/api';
const TABLE_ID = '848';

// Get data from Validate Image node
const userId = item.json.user_id;
const filename = item.json.filename;
const mimeType = item.json.mimeType;

// Get binary data
const binaryData = item.binary.data;

// STEP 1: Upload file to Baserow storage
const formData = new FormData();
formData.append('file', binaryData.data, {
  filename: filename,
  contentType: mimeType
});

const uploadResponse = await axios.post(
  `${BASEROW_API}/user-files/upload-file/`,
  formData,
  {
    headers: {
      'Authorization': `Token ${BASEROW_TOKEN}`,
      ...formData.getHeaders()
    }
  }
);

const uploadedFile = uploadResponse.data;

// STEP 2: Create database row with file reference
const createRowResponse = await axios.post(
  `${BASEROW_API}/database/rows/table/${TABLE_ID}/`,
  {
    field_8324: userId,      // user_id
    field_8325: filename,    // filename
    field_8326: [{           // avatar
      name: uploadedFile.name,
      visible_name: uploadedFile.original_name
    }]
  },
  {
    headers: {
      'Authorization': `Token ${BASEROW_TOKEN}`,
      'Content-Type': 'application/json'
    }
  }
);

const row = createRowResponse.data;

// Return result
return {
  json: {
    id: row.id,
    user_id: row.field_8324,
    filename: row.field_8325,
    avatar: row.field_8326,
    avatarUrl: row.field_8326[0].url
  }
};
