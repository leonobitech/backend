const message = $input.first().json.body.message;
const chatId = message.chat.id;
const timestamp = message.date;

return {
  json: {
    channel_user_id: chatId,
    caption: message.caption || "",
    photo_file_id: message.photo[message.photo.length - 1].file_id,
    file_name: `foto_${chatId}_${timestamp}.jpg`,
  },
};
