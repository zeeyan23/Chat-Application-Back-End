import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import axios from "axios"

import UserModel from "../model/user.model.js";
import GroupModel from "../model/group.model.js";
import { getSocketInstance } from "../socket.js";
import MessageModel from "../model/message.model.js";

const router = express.Router();

//End point to save message
const storage = multer.diskStorage({
    destination: function (req, file, cb){
        cb(null,'files/')
    },
    filename: function (req, file, cb){
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null,uniqueSuffix + '-' + file.originalname);
    }
})
// const upload = multer ({storage :storage});
const upload = multer ({storage :storage,
    limits: { fileSize: 100 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|mp4|mov|pdf|docx|pptx|xlsx|zip|m4a|mp3|wav|3gp/; 
        const extName = fileTypes.test(file.mimetype);
        if (extName) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed!'), false);
        }
    },
});


router.post('/messages',(req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "Max file size is 100MB." });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
  },async (req, res)=>{
  
    try {
        const {senderId,recepientId, messageType, message, duration, videoName, replyMessage, 
          fileName, imageViewOnce,videoViewOnce, groupId, isGroupChat} = req.body;
        
        const actualRecepientId = isGroupChat ? groupId : recepientId;
        const newMessage = new MessageModel({
            senderId,
            recepientId : actualRecepientId,
            messageType,
            message,
            timeStamp:new Date(),
            imageViewOnce,
            videoViewOnce,
            isGroupChat,
            replyMessage: replyMessage ? replyMessage : null,
            imageUrl:messageType ==='image' ? req.file?.path : null,
            videoUrl: messageType === 'video' ? req.file?.path.replace(/\\/g, '/') : null,
            duration :messageType === 'video' || messageType === 'audio' ? Math.floor(duration / 1000) : null,
            documentUrl: ['pdf', 'docx', 'pptx', 'xlsx', 'zip'].includes(messageType) ? req.file?.path.replace(/\\/g, '/') : null,
            fileName: ['pdf', 'docx', 'pptx', 'xlsx', 'zip'].includes(messageType) ? fileName :null,
            videoName : messageType === 'video' ? videoName : null,
            audioUrl: messageType === 'audio' ? req.file?.path.replace(/\\/g, '/') : null,
            // messageDisappearTime : messageDisappearTime,
            // messageShouldDisappear : messageShouldDisappear
        })
        const savedMessage = await newMessage.save();
        const user = await UserModel.findById(recepientId);
        const result = await UserModel.updateOne(
          { '_id': recepientId, 'friends.0.deletedChats': senderId }, // Find the user and the specific chatId in deletedChats
          { $pull: { 'friends.0.deletedChats': senderId } } // Remove the chatId from the deletedChats array
        );

        const io = getSocketInstance();
        const messageData = await MessageModel.findById(savedMessage._id).populate("senderId", "_id user_name").populate({
          path: "replyMessage",
          populate: {
              path: "senderId",
              select: "_id user_name"
          }
        });

        if(isGroupChat){
          const groupDetails = await GroupModel.findById(actualRecepientId).populate('groupMembers', '_id');
  
          if (!groupDetails) return console.error("❌ Group not found!");

  
          // Emit to each group member's room (userId)
          groupDetails.groupMembers.forEach((member) => {
            const memberId = member._id.toString(); // Convert ObjectId to a string
            if (memberId !== senderId) {
              io.to(memberId).emit("newMessage", messageData);
            }
          });
          
        }else{
          io.to(actualRecepientId).emit("newMessage", messageData);
        }
      
        
        
        if(!isGroupChat){
          const recipient = await UserModel.findById(actualRecepientId);
          if (!recipient || !recipient.expoPushToken) {
              return res.status(404).json({ message: "Recipient not found or push token missing." });
          }

          const sender = await UserModel.findById(senderId);
          const userName = sender.user_name
          const notificationData = {
              to: recipient.expoPushToken, 
              sound: 'default',
              title: `${messageType} Message from ${sender.user_name}`,
              body: messageType === 'text' ? message : `You received a ${messageType}.`,
              data: { senderId, recepientId, messageType, userName},
          };

          await axios.post('https://exp.host/--/api/v2/push/send', notificationData, {
              headers: {
                  'Content-Type': 'application/json',
              },
          });

        }else{
          const groupDetails = await GroupModel.findById(actualRecepientId).populate({
            path: 'groupMembers', // The field to populate
            select: 'expoPushToken', // Specify fields you want to retrieve from UserModel
          });
      
          if (!groupDetails) {
            
            return;
          }
          const expoPushTokens = groupDetails.groupMembers.map(member => member.expoPushToken);

          const groupAdmin = await UserModel.findById(groupDetails.groupAdmin);
          
          if (groupAdmin && groupAdmin.expoPushToken) {
            expoPushTokens.push(groupAdmin.expoPushToken);
          }
          const sender = await UserModel.findById(senderId);
          const userName = sender.user_name;
          for (const token of expoPushTokens) {
            
            const notificationData = {
              to: token, // Sending to each expoPushToken
              sound: 'default',
              title: `${messageType} Message from ${groupDetails.groupName}`,
              body: messageType === 'text' ? message : `You received a ${messageType}.`,
              data: { senderId, groupId: groupDetails._id, messageType, userName },
            };
      
            // Sending notification via Expo Push API
            await axios.post('https://exp.host/--/api/v2/push/send', notificationData, {
              headers: {
                'Content-Type': 'application/json',
              },
            });
      
            
          }
      
        }
        
        res.status(200).json({message:"Message sent successfully and notification delivered."})

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

router.patch('/viewedImageOnce/true', async (req,res)=>{
    try {
      const {imageViewed,id } = req.body;
  
      const updatedMessages = await MessageModel.findByIdAndUpdate(
      id,
      { $set: { imageViewed } },
      { new: true } // Ensures the updated document is returned
      ).populate('senderId', '_id').populate('recepientId'); // Populate fields
  
      const io = getSocketInstance();
      io.to(updatedMessages.senderId._id.toString()).emit('imageViewedUpdate', updatedMessages);
      io.to(updatedMessages.recepientId._id.toString()).emit('imageViewedUpdate', updatedMessages);
  
      return res.status(200).json(updatedMessages);
    } catch (error) {
      console.error('Error updating starred messages:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  })
  
router.patch('/viewedVideoOnce/true', async (req,res)=>{
    try {
      const {videoViewed,id } = req.body;
  
      const updatedMessages = await MessageModel.findByIdAndUpdate(
      id,
      { $set: { videoViewed } },
      { new: true } // Ensures the updated document is returned
      ).populate('senderId', '_id').populate('recepientId'); // Populate fields
  
      const io = getSocketInstance();

      io.to(updatedMessages.senderId._id.toString()).emit('videoViewedUpdate', updatedMessages);
      io.to(updatedMessages.recepientId._id.toString()).emit('videoViewedUpdate', updatedMessages);
  
      return res.status(200).json(updatedMessages);
    } catch (error) {
      console.error('Error updating starred messages:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  })

//fetch messages
router.get('/get-messages/:senderId/:recepientId',async (req, res)=>{
    try {
        const {senderId, recepientId} = req.params;
        const now = new Date();
        const message = await MessageModel.find({
            $or:[
                {senderId : senderId, recepientId: recepientId},
                {senderId : recepientId, recepientId: senderId},
            ]
        })
        .populate("senderId", "_id user_name image")
        .populate({
          path: "replyMessage",
          populate: {
              path: "senderId", 
              select: "_id user_name image"
          }
        });

      const filteredMessages = message?.filter(message => {
          const createdDateLocal = new Date(message.created_date);
          const expiryTime = new Date(createdDateLocal.getTime()  + 24 * 60 * 60 * 1000); 

          return now < expiryTime; 
      });

      const expiredMessageIds = message
          .filter(msg => !filteredMessages.includes(msg))
          .map(msg => msg._id);

      if (expiredMessageIds.length > 0) {
          await MessageModel.deleteMany({ _id: { $in: expiredMessageIds } });
      }

      res.json({ message: filteredMessages });
    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

router.get("/get-group-messages/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const now = new Date();
    const messages = await MessageModel.find({
      recepientId: groupId,
    }).populate("senderId", "_id user_name image").populate("replyMessage");

    const filteredMessages = messages?.filter(message => {
    const createdDateLocal = new Date(message.created_date);

    const expiryTime = new Date(createdDateLocal.getTime()  + 24 * 60 * 60 * 1000); 
      return now < expiryTime; 
    });

    const expiredMessageIds = messages
        .filter(msg => !filteredMessages.includes(msg))
        .map(msg => msg._id);

    if (expiredMessageIds.length > 0) {
        await MessageModel.deleteMany({ _id: { $in: expiredMessageIds } });
    }

    res.status(200).json({ message: filteredMessages });
    //res.status(200).json({ message: messages });
  } catch (error) {
    console.log("Error:", error);
    res.status(500).json({ error: "Failed to fetch group messages" });
  }
});

//delete messages
router.post('/deleteMessages/',async (req, res)=>{
    try {
        const {messages, userId,recipentId} = req.body;
        
        if(!Array.isArray(messages) || messages.length === 0){
            return res.status(400).json({message: "invalid req body"});
        }
        const objectIds = messages.map(id => new mongoose.Types.ObjectId(id));

        await MessageModel.deleteMany({_id:{$in: objectIds}})       

        const messageIds = messages.map((msg) => msg.toString());
        const io = getSocketInstance();
        // Emit to each user's room individually
        io.to(userId).emit('messages_deleted_for_both', { messageIds });
        io.to(recipentId).emit('messages_deleted_for_both', { messageIds });
        res.json({messages : "Message deleted successfully"})

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

router.post('/deleteForMeMessages/',async (req, res)=>{
  try {
    const { messages, userId, recepientId } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: "Invalid request body" });
    }

    const objectIds = messages.map(id => new mongoose.Types.ObjectId(id));

    await MessageModel.updateMany(
      { _id: { $in: objectIds } },
      { $addToSet: { clearedBy: userId } }
    );
    const io = getSocketInstance();

    io.to(userId).emit('messages_deleted_for_me',{messages});

    res.json({ message: "Messages marked as deleted for user" });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
})

router.post('/messages/forward', async (req, res) => {
    const { senderId, recipientId, messageIds } = req.body;
    console.log(senderId, recipientId, messageIds)

    try {
      // Validate IDs
      const validMessageIds = messageIds.map(item => new mongoose.Types.ObjectId(item.messageId));
      const originalMessages = await MessageModel.find({ _id: { $in: validMessageIds } });
  
      if (originalMessages.length === 0) {
        return res.status(404).json({ error: 'No messages found' });
      }
  
      const forwardedMessages = originalMessages.map((msg) => ({
        senderId,
        recepientId: recipientId,
        messageType: msg.messageType,
        message: msg.message,
        imageUrl: msg.imageUrl,
        videoUrl: msg.videoUrl,
        audioUrl: msg.audioUrl,
        videoName: msg.videoName,
        duration: msg.duration,
        replyMessage: msg.replyMessage,
      }));
  
      await MessageModel.insertMany(forwardedMessages);
  
      res.status(200).json({ message: 'Messages forwarded successfully' });
    } catch (error) {
      console.error('Error forwarding messages:', error);
      res.status(500).json({ error: 'Error forwarding messages' });
    }
  });
  
  router.patch('/star-messages', async (req, res) => {
    try {
        const { messageIds, starredBy } = req.body;

        const messageIdList = messageIds.map((item) => item.messageId);

        const updatedMessages = await MessageModel.updateMany(
          { _id: { $in: messageIdList } },
          { $addToSet: { starredBy } },
          { new: true }  
        );
    
        if (updatedMessages.nModified === 0) {
          return res.status(404).json({ message: 'No messages found to update' });
        }
    
        return res.status(200).json({ message: 'Messages updated successfully' });
      } catch (error) {
        console.error('Error updating starred messages:', error);
        return res.status(500).json({ message: 'Internal server error' });
      }
  });

  router.get('/get-starred-messages/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      const starredMessages = await MessageModel.find({ starredBy: userId })
        .populate('senderId', 'user_name')
        .populate('starredBy', 'user_name')  
        .populate('recepientId', 'user_name')
        .sort({ created_date: -1 });
  
      if (starredMessages.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No starred messages found for the user",
        });
      }
  
      res.status(200).json(starredMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch messages",
        error: error.message,
      });
    }
  });
  
  router.get('/get-starred-message/:id/:userId/', async (req, res) => {
    try {
      const {id, userId} = req.params;
      const messageExists = await MessageModel.exists({ _id: id,"starredBy": userId });
      
  
      if (messageExists) {
        return res.status(200).json({ exists: true, message: "Message exists in the database." });
      } else {
        return res.status(404).json({ exists: false, message: "Message not found." });
      }
    } catch (error) {
      console.error("Error checking message existence:", error);
      res.status(500).json({ exists: false, error: "Internal server error" });
    }
  });

  router.delete('/delete-starred-message/:userId/:id', async (req, res) => {
    try {
      const {id, userId} = req.params;

      const result = await MessageModel.updateOne(
        { _id: id },
        { $pull: { starredBy: userId } }
      );
  
      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: "Message not found or user was not starred." });
      }
  
      res.status(200).json({ message: "Starred message removed successfully." });
    } catch (error) {
        console.error("Error removing starred message:", error);
        res.status(500).json({ message: "Internal server error." });
    }
  });

  router.delete('/api/delete-all', async (req, res) => {
    try {
      const result = await MessageModel.deleteMany({});
      res.status(200).json({ message: 'All records deleted', deletedCount: result.deletedCount });
    } catch (error) {
      res.status(500).json({ error: 'Error deleting records', details: error.message });
    }
  });
export default router;