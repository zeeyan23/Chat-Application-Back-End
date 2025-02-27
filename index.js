import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import passport from "passport";
import LocalStratergy from "passport-local"
import cors from "cors";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv"
import UserModel from "./model/user.model.js";
import MessageModel from "./model/message.model.js";
import GroupModel from "./model/group.model.js";
import multer from "multer";
import axios from "axios"
import { Server } from "socket.io";
import http from "http";
import { createServer } from 'node:http';
import { ObjectId } from 'mongodb';
import path from "path"

const app = express()
const server = createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.send('Server is running!');
});
const connectedUsers = {};
let users = {};
const online_users={};

io.on('connection', (socket) => {
  console.log("user connected", socket.id)
  socket.on("join", async(userId) => {
    socket.join(userId);
    connectedUsers[userId] = socket.id;
  });

  // socket.on("sendMessage", ({ recipientId, message }) => {
  //   io.to(recipientId).emit("newMessage", message);
  // });
  // socket.on("registerUser", (userId) => {
  //   connectedUsers[userId] = socket.id;
  // });

  // socket.on("online_user", (userId) => {
  //   console.log(`✅ Registered ${userId} with socket ID: ${socket.id}`);
  //   online_users[userId] = socket.id;
  // });

  socket.on("send_message", (data) => {
    if(data.isGroupChat){
      io.to(data.groupId).emit("receive_message", data);
    }else{
      io.to(data.receiverId).emit("receive_message", data);
    }
    socket.broadcast.emit("update_chat", data);
  });

  // socket.on('joinRoom', (userId) => {
  //   socket.join(userId); 
  // });

  // socket.on("user_online", async ({ userId }) => {
  //   users[userId] = socket.id; 
  //   await UserModel.findByIdAndUpdate(userId, { isOnline: true });
  //   io.emit("update_user_status", { userId, isOnline: true });
  // });

  // socket.on("user_offline", async ({ userId }) => {
  //   const lastOnlineTime = new Date();
  //   delete users[userId];
  //   await UserModel.findByIdAndUpdate(userId, { isOnline: false, lastOnlineTime: new Date() });
  //   io.emit("update_user_status", { userId, isOnline: false, lastOnlineTime });
  // });


  //voice call
  // socket.on("call-user", async({ from, to, channelName, isGroupCall }) => {
  //   if(isGroupCall){
  //     const groupDetails = await GroupModel.findById(to).populate('groupMembers', '_id');
  //     // Emit to each group member's room (userId)
  //     groupDetails.groupMembers.forEach((member) => {
  //       const memberId = member._id.toString();
  //       if (memberId !== from) {
  //         io.to(memberId).emit("incoming-call", { from, channelName,isGroupCall });
  //       }
  //     });
  //   }else{
  //     if (connectedUsers[to]) {
  //       io.to(connectedUsers[to]).emit("incoming-call", { from, channelName, isGroupCall });
  //     }
  //   }
  // });


  //voice call
  socket.on("voice_calling", (data) => {
    io.emit("incoming_voice_call", data);
  });

  socket.on("voice_call_accepted", (data) => {
    io.emit("voice_call_approved", { channelId: data.callerId });
  });

  socket.on("decline_voice_call", (data) => {
    io.emit("voice_call_declined", data);
  });

  socket.on("group_voice_calling", async (data) => {
    try {
      const groupDetails = await GroupModel.findById(data.groupId).select("groupMembers groupAdmin").exec();
  
      const callerInfo = await UserModel.findById(data.callerId).select("user_name image");
      let participants = groupDetails.groupMembers.map((id) => id.toString());

      // Ensure groupAdmin is included if missing
      const groupAdminId = groupDetails.groupAdmin.toString();
      if (!participants.includes(groupAdminId)) {
        participants.push(groupAdminId);
      }

      participants.forEach((memberId) => {
        memberId = memberId.toString();
        
        if (memberId !== data.callerId) {
          io.to(memberId).emit("incoming_group_voice_call", {
            groupId: data.groupId,
            participants: participants,
            callerId: data.callerId,
            callerName: callerInfo.user_name,
            callerImage: callerInfo.image,
          });
        }
      });
  
    } catch (error) {
      console.error("Error handling group voice call:", error);
    }
  });
  
  

  // socket.on("group_voice_call_accepted", (data) => {
  //   io.to(data.callerId).emit("group_voice_call_approved", {
  //     channelId: data.groupId,
  //     participants: data.participants,
  //   });
  // });

  socket.on("group_voice_call_accepted", async (data) => {
    try {
      // Fetch group details and members
      const groupDetails = await GroupModel.findById(data.groupId).populate(
        "groupMembers",
        "_id"
      );
  
      const validParticipants = data.participants.filter((id) => id);

      // Fetch participant info (user_name, image)
      const participantsInfo = await UserModel.find({
        _id: { $in: validParticipants },
      }).select("user_name image");

      const participantDetails = participantsInfo.map((user) => ({
        id: user._id.toString(),
        userName: user.user_name,
        userImage: user.image,
      }));


      const allMembers = groupDetails.groupMembers.map((member) => member._id.toString());
      if (data.callerId && !allMembers.includes(data.callerId)) {
        allMembers.push(data.callerId);
      }

      // Notify all group members (including the caller)
      allMembers.forEach((memberId) => {
        io.to(memberId).emit("group_voice_call_approved", {
          channelId: data.groupId,          // Agora channel (groupId as channelId)
          participants: participantDetails, // List of users (id, userName, userImage)
        });
      });

  
      // Track active group calls (optional, useful for managing ongoing calls)
      if (!global.activeGroupCalls) {
        global.activeGroupCalls = {};
      }
      if (!global.activeGroupCalls[data.groupId]) {
        global.activeGroupCalls[data.groupId] = [];
      }
      global.activeGroupCalls[data.groupId].push(data.userId);
  
      console.log(`Group voice call started for group: ${data.groupId}`);
    } catch (error) {
      console.error("Error in group_voice_call_accepted:", error);
    }
  });
  

  socket.on("decline_group_voice_call", async(callerData) => {
    const { callerId, groupId } = callerData;
   
    
    if(!groupId){
      console.log("participant declined call")
      console.log("caller id",callerId)
      io.to(callerId).emit("group_voice_call_declined", {
        message: "Call has been declined",
      });
    }else {
      console.log("Caller declined call");
      console.log("Caller ID:", callerId, "Group ID:", groupId);
    
      const groupDetails = await GroupModel.findById(groupId)
        .select("groupMembers groupAdmin")
        .exec();
    
      if (!groupDetails) {
        console.error("Group not found!");
        return;
      }
    
      let participants = groupDetails.groupMembers.map((id) => id.toString()) || [];
    
      const groupAdminId = groupDetails.groupAdmin.toString();
      if (!participants.includes(groupAdminId)) {
        participants.push(groupAdminId);
      }
    
      console.log("Participants to notify:", participants);
    
      participants.forEach((memberId) => {
        if (memberId.toString() !== callerId.toString()) {
          console.log("Emitting to:", memberId);
          io.to(memberId).emit("group_voice_call_declined", {
            message: "The caller has declined the call.",
          });
        }
      });
    }
    
  });


  //video call
  socket.on("video_calling", (data) => {
    io.emit("incoming_video_call", data);
  });

  socket.on("video_call_accepted", (data) => {
    io.emit("video_call_approved", { channelId: data.callerId });
  });

  socket.on("decline_video_call", (data) => {
    io.emit("video_call_declined", data);
  });

  

  socket.on("disconnect", async(reason) => {
    console.log("User disconnected:", socket.id, "Reason:", reason);
  });
});

server.listen(3000, () => {
  console.log('server running');
});

app.use(cors());
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());
app.use(passport.initialize())

dotenv.config()
const PORT= process.env.PORT || 3000;
const uri= process.env.MONGODB_URI;

try{
    mongoose.connect(uri);
    console.log("connected to MongoDB");
}catch(err){
    console.log("Error connection", err);
}

app.use("/files", express.static(path.resolve("D:/CHAT APP/Backend/files")));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
 // Create HTTP server

//API's

// Registering User

app.get('/', (req, res) => {
    res.send('Server is running!');
});

app.post('/create_user',(req, res)=>{
    const {user_name, email, password} = req.body;

    const user = new UserModel({user_name, email, password});
    user.save().then(()=>{
        res.status(200).json({ message: "User Account Created"})
    }).catch((err)=>{
        res.status(500).json({message:"Error registering your account"})
    })
})

// app.get("/user/status/:recipientId", async (req, res) => {
//   try {
//       const { recipientId } = req.params;
//       const user = await UserModel.findById(recipientId, "isOnline lastOnlineTime");

//       if (!user) {
//           return res.status(404).json({ message: "User not found" });
//       }

//       res.json({
//           isOnline: user.isOnline,
//           lastOnlineTime: user.lastOnlineTime,
//       });
//   } catch (error) {
//       console.error("Error fetching user status:", error);
//       res.status(500).json({ message: "Internal server error" });
//   }
// });


const createToken = (userId) =>{
    const payload={
        userId:userId
    }

    const token = jsonwebtoken.sign(payload, "Q$r2K6W8n!jCW%Zk");

    return token;
}
// Login user
app.post('/user_login', async (req, res) => {
  const { email, password, expoPushToken } = req.body;

  if (!email || !password) {
      return res.status(400).json({ message: "Please enter both email and password" });
  }

  try {
      // Normalize the email: trim spaces and convert to lowercase
      const normalizedEmail = email.trim().toLowerCase();

      // Find user by normalized email
      const user = await UserModel.findOne({ email: normalizedEmail });

      if (!user) {
          return res.status(404).json({ message: "User Not Found" });
      }

      if (user.password !== password) {
          return res.status(401).json({ message: "Invalid Password" });
      }

      // Update expoPushToken if provided
      if (expoPushToken) {
          user.expoPushToken = expoPushToken;
          await user.save();
      }

      // Create token
      const token = createToken(user.id);

      const friendsList = user.friends?.[0]?.friendsList || [];
      const validFriends = await UserModel.find({ _id: { $in: friendsList } }).select('_id');
      const hasValidFriends = validFriends.length > 0;

      // Check groups array for valid group IDs
      const validGroups = await GroupModel.find({ _id: { $in: user.groups } }).select('_id');
      const hasValidGroups = validGroups.length > 0;

      // Include checks in response
      res.status(200).json({
          token,
          userId: user.id,
          hasValidFriends,
          hasValidGroups,
      });
  } catch (error) {
      console.error("Error in finding the user or validating data", error);
      res.status(500).json({ message: "Error in finding the user or validating data" });
  }
});


app.get('/get-user-id-from-token', async (req, res) => {
  try {
      const token = req.headers.authorization?.split(' ')[1];  // Extract the token
      if (!token) {
          return res.status(400).json({ message: "Token is required" });
      }

      const decodedToken = jsonwebtoken.verify(token, 'Q$r2K6W8n!jCW%Zk'); // Replace with your secret key
      const userId = decodedToken.userId;

      return res.status(200).json({ userId });
  } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error decoding token" });
  }
});

app.get("/all_users/:userId", (req, res) => {
    const loggedInUserId = req.params.userId;
  
    UserModel.find({ _id: { $ne: loggedInUserId } })
      .then((users) => {
        res.status(200).json(users);
      })
      .catch((err) => {
        console.log("Error retrieving users", err);
        res.status(500).json({ message: "Error retrieving users" });
      });
  });

//send friend request
app.post('/friend-request/',async (req, res)=>{

    const {currentUserId, selectedUserId} = req.body;

    try {
        await UserModel.findByIdAndUpdate(selectedUserId,{
            $addToSet: {friendRequests : currentUserId}
        });

        await UserModel.findByIdAndUpdate(currentUserId,{
            $addToSet: {sentFriendRequests : selectedUserId}
        });

        const sender = await UserModel.findById(currentUserId).select("user_name");
        const recipientSocketId = connectedUsers[selectedUserId];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("friendRequestReceived", {
                senderId: currentUserId,
                senderName: sender.user_name,
            });
        }

        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(500);
    }
})

//Get friend requests api
app.get('/get-friend-request/:userId',async (req, res)=>{

    try {
        const {userId} = req.params;
        const users = await UserModel.findById(userId).populate("friendRequests","user_name email image") .lean()       

        const friendRequests = users.friendRequests;
        res.json(friendRequests)
    } catch (error) {
        res.sendStatus(500);
    }
})

//accept friend api
app.post('/accept-friend-request/accept',async (req, res)=>{

    try {
        const {senderId, recepientId} = req.body;
        const sender = await UserModel.findById(senderId)
        const recepient = await UserModel.findById(recepientId)           

        // sender.friends.friendsList.push(recepientId)
        // recepient.friends.friendsList.push(senderId)

        if (sender.friends.length === 0) {
            sender.friends.push({ friendsList: [], deletedChats: null });
        }
        if (recepient.friends.length === 0) {
            recepient.friends.push({ friendsList: [], deletedChats: null });
        }

        sender.friends[0].friendsList.push(recepientId);
        recepient.friends[0].friendsList.push(senderId);

        recepient.friendRequests = recepient.friendRequests.filter((request)=> request.toString() !== senderId.toString())
        sender.sentFriendRequests = sender.sentFriendRequests.filter((request)=> request.toString() !== recepientId.toString())

        await sender.save();
        await recepient.save();

        const senderSocketId = connectedUsers[senderId];
        const recepientSocketId = connectedUsers[recepientId];

        if (senderSocketId) {
            io.to(senderSocketId).emit('friendRequestAccepted', {
                userId: recepientId,
            });
        }

        if (recepientSocketId) {
            io.to(recepientSocketId).emit('friendRequestAccepted', {
                userId: senderId,
            });
        }
        res.status(200).json({message:"Friend request accepted"})
    } catch (error) {
        res.sendStatus(500);
    }
})

app.get('/has-friends/:userId',async (req, res)=>{
  try {
      const {userId} = req.params;
      const messageExists = await UserModel.exists({"friends.friendsList": userId });
  
      if (messageExists) {
        return res.status(200).json({ exists: true, message: "User has friends." });
      } else {
        return res.status(200).json({ exists: false, message: "User has no friends." });
      }

  } catch (error) {
      console.log(error)
      res.sendStatus(500);
  }
})

//Get all friends to chat
app.get('/get-all-friends/:userId',async (req, res)=>{
    try {
        const {userId} = req.params;
        const users = await UserModel.findById(userId).populate("friends.friendsList","user_name email image isOnline lastOnlineTime")
          .populate("groups","groupName groupMembers image").populate("pinnedChats", "_id").lean()       
        
        res.json({
          friends: users.friends,
          pinnedChats: users.pinnedChats,
          groups: users.groups
      });

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

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


app.post('/messages',(req, res, next) => {
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
        const {senderId, recepientId, messageType, message, duration, videoName, replyMessage, fileName, 
          imageViewOnce,videoViewOnce, groupId, isGroupChat} = req.body;
        
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
        })
        const savedMessage = await newMessage.save();
        
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
  
          console.log("📤 Emitting group message to members:", groupDetails.groupMembers.map(m => m._id.toString()));

  
          // Emit to each group member's room (userId)
          groupDetails.groupMembers.forEach((member) => {
            const memberId = member._id.toString(); // Convert ObjectId to a string
            if (memberId !== senderId) {
              io.to(memberId).emit("newMessage", messageData);
            }
          });
          
        }else{
          console.log("📤 Emitting group message to", actualRecepientId);
          io.to(actualRecepientId).emit("newMessage", messageData);
        }
      
        
        
        if(!isGroupChat){
          const recipient = await UserModel.findById(recepientId);
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

app.patch('/viewedImageOnce/true', async (req,res)=>{
  try {
    const {imageViewed,id } = req.body;

    const updatedMessages = await MessageModel.findByIdAndUpdate(
    id,
    { $set: { imageViewed } },
    { new: true } // Ensures the updated document is returned
    ).populate('senderId', '_id').populate('recepientId'); // Populate fields

    console.log(JSON.stringify(updatedMessages, null, 2))

    io.to(updatedMessages.senderId._id.toString()).emit('imageViewedUpdate', updatedMessages);
    io.to(updatedMessages.recepientId._id.toString()).emit('imageViewedUpdate', updatedMessages);

    return res.status(200).json(updatedMessages);
  } catch (error) {
    console.error('Error updating starred messages:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
})

app.patch('/viewedVideoOnce/true', async (req,res)=>{
  try {
    const {videoViewed,id } = req.body;

    const updatedMessages = await MessageModel.findByIdAndUpdate(
    id,
    { $set: { videoViewed } },
    { new: true } // Ensures the updated document is returned
    ).populate('senderId', '_id').populate('recepientId'); // Populate fields

    io.to(updatedMessages.senderId._id.toString()).emit('videoViewedUpdate', updatedMessages);
    io.to(updatedMessages.recepientId._id.toString()).emit('videoViewedUpdate', updatedMessages);

    return res.status(200).json(updatedMessages);
  } catch (error) {
    console.error('Error updating starred messages:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
})

//fetch messages
app.get('/get-messages/:senderId/:recepientId',async (req, res)=>{
    try {
        const {senderId, recepientId} = req.params;
        const message = await MessageModel.find({
            $or:[
                {senderId : senderId, recepientId: recepientId},
                {senderId : recepientId, recepientId: senderId},
            ]
        })
        .populate("senderId", "_id user_name image")
        .populate({
          path: "replyMessage", // Populate replyMessage
          populate: {
              path: "senderId", // Nested population for senderId inside replyMessage
              select: "_id user_name image" // Select only necessary fields
          }
        });
        res.json({message})

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

app.get("/get-group-messages/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const messages = await MessageModel.find({
      recepientId: groupId,
    }).populate("senderId", "_id user_name image").populate("replyMessage");;
    res.status(200).json({ message: messages });
  } catch (error) {
    console.log("Error:", error);
    res.status(500).json({ error: "Failed to fetch group messages" });
  }
});

app.get("/get_chat_info/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    let userInfo = await GroupModel.findById(id)
      .populate("groupMembers", "user_name email image")
      .populate("groupAdmin", "user_name email image");

      if (!userInfo) {
        userInfo = await UserModel.findById(id).select("user_name email image");
      }

      if (!userInfo) {
        return res.status(404).json({ error: "User or group not found" });
      }
  
      res.status(200).json(userInfo);

  } catch (error) {
    console.log("Error:", error);
    res.status(500).json({ error: "Failed to fetch group messages" });
  }
});

//delete messages
app.post('/deleteMessages/',async (req, res)=>{
    try {
        const {messages, userId,recipentId} = req.body;
        
        if(!Array.isArray(messages) || messages.length === 0){
            return res.status(400).json({message: "invalid req body"});
        }
        const objectIds = messages.map(id => new mongoose.Types.ObjectId(id));

        await MessageModel.deleteMany({_id:{$in: objectIds}})       

        const messageIds = messages.map((msg) => msg.toString());

        // Emit to each user's room individually
        io.to(userId).emit('messages_deleted_for_both', { messageIds });
        io.to(recipentId).emit('messages_deleted_for_both', { messageIds });
        res.json({messages : "Message deleted successfully"})

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

app.post('/deleteForMeMessages/',async (req, res)=>{
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

    io.to(userId).emit('messages_deleted_for_me',{messages});

    res.json({ message: "Messages marked as deleted for user" });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
})

app.get('/friend-requests/sent/:userId',async (req, res)=>{

    try {
        const {userId} = req.params;
        const user = await UserModel.findById(userId).populate("sentFriendRequests","user_name email").lean();

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const sentFriendRequests = user.sentFriendRequests;
        res.json(sentFriendRequests);
    } catch (error) {
        console.log("error",error);
        res.status(500).json({ error: "Internal Server" });
    }
})

app.get('/friend-requests/received/:userId',async (req, res)=>{

    try {
        const {userId} = req.params;
        const user = await UserModel.findById(userId).populate("friendRequests","user_name email").lean();

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const sentFriendRequestsReceived = user.friendRequests;
        res.json(sentFriendRequestsReceived);
    } catch (error) {
        console.log("error",error);
        res.status(500).json({ error: "Internal Server" });
    }
})

app.get('/friends/:userId',async (req, res)=>{

    try {
        const {userId} = req.params;
        UserModel.findById(userId).populate("friends").then((user)=>{
            if(!user){
                res.status(404).json({message: "user not found"});
            }

            const friendIds= user.friends.map((friend)=> friend.friendsList);
            res.status(200).json(friendIds);
        });
    } catch (error) {
        res.sendStatus(500);
    }
})

app.post('/messages/forward', async (req, res) => {
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
  
  app.patch('/star-messages', async (req, res) => {
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

  app.get('/get-starred-messages/:userId', async (req, res) => {
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
  
  app.get('/get-starred-message/:id/:userId/', async (req, res) => {
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

  app.delete('/delete-starred-message/:userId/:id', async (req, res) => {
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

  app.post('/clear-chat', async (req, res) => {
    try {
        const {userId, otherUserId} = req.body;
        const result = await MessageModel.updateMany(
          {
            
            $or: [
              { senderId: userId, recepientId: otherUserId },
              { senderId: otherUserId, recepientId: userId },
            ],
          },
          { $addToSet: { clearedBy: userId } }
        );
    
        const updatedMessages = await MessageModel.find({
            $or: [
              { senderId: userId, recepientId: otherUserId },
              { senderId: otherUserId, recepientId: userId }
            ],
            clearedBy: { $ne: userId } 
          });
          res.status(200).json(updatedMessages);
      } catch (error) {
        console.error('Error clearing chat:', error);
        res.status(500).json({ message: 'Internal server error.' });
      }
  });
  

  // app.delete('/api/messages', async (req, res) => {
  //   try {
  //     await MessageModel.deleteMany({});
  //     res.status(200).json({ message: 'All messages have been deleted successfully.' });
  //   } catch (error) {
  //     res.status(500).json({ error: 'An error occurred while deleting messages.' });
  //   }
  // });

  app.patch("/deleteChat", async (req, res) => {
    const { userId, chatsTobeDeleted } = req.body;
    
    if (!userId || !Array.isArray(chatsTobeDeleted)) {
      return res.status(400).json({ message: "Invalid request data" });
    }
  
    try {
      const user = await UserModel.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Add the chats to the deletedChats field, ensuring no duplicates
      user.friends.forEach((friend) => {
        friend.deletedChats = [
          ...(friend.deletedChats || []),
          ...chatsTobeDeleted,
        ];
      });
      const result = await MessageModel.updateMany(
        {
          $or: [
            { senderId: userId, recepientId: { $in: chatsTobeDeleted } },
            { senderId: { $in: chatsTobeDeleted }, recepientId: userId },
          ],
        },
        { $addToSet: { clearedBy: userId } }
      );
      
      // Find messages that were not cleared by `userId`
      const updatedMessages = await MessageModel.find({
        $or: [
          { senderId: userId, recepientId: { $in: chatsTobeDeleted } },
          { senderId: { $in: chatsTobeDeleted }, recepientId: userId },
        ],
        clearedBy: { $ne: userId },
      });
      await user.save();
      res.status(200).json({ message: "Chats successfully marked as deleted" });
    } catch (error) {
      console.error("Error deleting chats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  //pinning chat
  app.patch("/updatePinnedChats", async (req, res) => {
    const { userId, pinnedChats } = req.body;
    
    if (!userId || !Array.isArray(pinnedChats)) {
      return res.status(400).json({ message: "Invalid request data" });
    }
  
    try {
      // Update the user's pinnedChats
      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { $addToSet: { pinnedChats: { $each: pinnedChats } } }, // Add chats to the array without duplicates
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const socketId = connectedUsers[userId];
      if (socketId) {
        io.to(socketId).emit("pinnedChatsUpdated", updatedUser.pinnedChats);
      }
      res.status(200).json({
        message: "Pinned chats updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Error updating pinned chats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/get-pinned-chats/:id/:userId/', async (req, res) => {
    const { id, userId } = req.params;
  
    try {
      // Query the User model to check if the pinnedChats array contains the given id
      const user = await UserModel.findOne({ _id: userId, pinnedChats: id });
  
      if (user) {
        // If the user is found and pinnedChats contains the id
        res.status(200).json({ exists: true });
      } else {
        // If the user is not found or pinnedChats does not contain the id
        res.status(200).json({ exists: false });
      }
    } catch (error) {
      console.error("Error checking Chat existence:", error);
      res.status(500).json({ exists: false, error: "Internal server error" });
    }
  });

  app.delete('/unPinChats/:id/:userId', async (req, res) => {
    try {
      const {id, userId} = req.params;
      const result = await UserModel.updateMany(
        { _id: userId },
        { $pull: { pinnedChats: id } }
      );
  
      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: "Chat not found or user was not pinned." });
      }
  
      const user = await UserModel.findById(userId);
      const socketId = connectedUsers[userId];
      if (socketId) {
        io.to(socketId).emit("pinnedChatsUpdated", user.pinnedChats);
      }
      res.status(200).json({ message: "Pinned message removed successfully." });
    } catch (error) {
        console.error("Error removing pinned message:", error);
        res.status(500).json({ message: "Internal server error." });
    }
  });
  

  app.patch('/creategroup/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const { groupName, groupMembers, groupIcon } = req.body;
        const user = await UserModel.findById(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const createdGroup = new GroupModel({
            groupName,
            groupMembers,
            groupIcon,
            groupAdmin: user._id,
        });
        await createdGroup.save();

        const allMembers = [...groupMembers, userId]
        await UserModel.updateMany(
            { _id: { $in: allMembers } },
            { $push: { groups: createdGroup._id } }
        );

        res.status(200).json({
            message: "Group created successfully.",
            group: createdGroup,
        });
    } catch (error) {
        console.error("Error creating group:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
  

app.get("/user-data/:userId", async(req, res) => {
  const loggedInUserId = req.params.userId;

  try {
    // Fetch user data from the database
    const user = await UserModel.findById(loggedInUserId).select("user_name email password image");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Send the user data as the response
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.patch("/users/update", async (req, res) => {
  const { userId, user_name, email,password } = req.body;

  try {
    // Find user by ID and update the specified fields
    const updateFields = {};
    if (user_name) updateFields.user_name = user_name;
    if (email) updateFields.email = email;
    if (password) updateFields.password = password;

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true } // Return the updated document
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "User updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal Server Error", error });
  }
});

app.patch('/update_password' ,async(req, res)=>{
  try {
    const { email, password } = req.body;

    const user = await UserModel.findOne({ email: email.toLowerCase() });

    if (!user) {
        return res.status(404).json({ message: "User not found." });
    }

    //const hashedPassword = await bcrypt.hash(password, 10);

    await UserModel.updateOne({ email: email.toLowerCase() }, { $set: { password: password } });

    res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.patch('/update-userdata/:userId', upload.single('file'), async (req, res) => {
  try {
      const userId = req.params.userId;
      const filePath = req.file?.path;
      if (!filePath) {
          return res.status(400).json({ message: 'No file uploaded' });
      }

      const updatedUser = await UserModel.findByIdAndUpdate(userId, {
          image: filePath,  
      }, { new: true });

      const savedMessage = await updatedUser.save();
      if (!updatedUser) {
          return res.status(404).json({ message: 'User not found' });
      }

      // Send a response with the updated user data
      res.status(200).json({
          message: 'User data updated successfully',
          user: updatedUser
      });
  } catch (error) {
      console.error('Error updating user data:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.patch('/update-groupData/:userId', upload.single('file'), async (req, res) => {
  try {
      const userId = req.params.userId;
      const filePath = req.file?.path;
      if (!filePath) {
          return res.status(400).json({ message: 'No file uploaded' });
      }

      const updatedGroup = await GroupModel.findByIdAndUpdate(userId, {
          image: filePath,  
      }, { new: true });

      const savedMessage = await updatedGroup.save();
      if (!updatedGroup) {
          return res.status(404).json({ message: 'User not found' });
      }

      // Send a response with the updated user data
      res.status(200).json({
          message: 'Group data updated successfully',
          user: updatedGroup
      });
  } catch (error) {
      console.error('Error updating user data:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.delete('/remove_chat_from_deleted_chat', async (req, res) => { 
  try {
    const {userId, chatsTobeRemovedFromDeletedChat} = req.body;
    const result = await UserModel.updateOne(
      { _id: userId, "friends.deletedChats": chatsTobeRemovedFromDeletedChat }, 
      { $pull: { "friends.$.deletedChats": chatsTobeRemovedFromDeletedChat } } 
    );

      if (result.modifiedCount > 0) {
          res.status(200).json({ message: "Friends removed successfully" });
      } else {
          res.status(404).json({ message: "No friends found or already removed" });
      }
  } catch (error) {
      console.error("Error removing friends:", error.message, error.stack);
      res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

//   app.delete('/accept-friend-request/remove', async (req, res) => {
//     try {
//         const userId = new ObjectId("676688039c120a4cba2c52dc");
//         const friendIdToRemove = new ObjectId("6766d8963cc557866f307da9");

//         const result = await UserModel.updateOne(
//             { _id: userId },
//             { $pull: { friends: friendIdToRemove } }
//         );

//         if (result.modifiedCount > 0) {
//             res.status(200).json({ message: "Friend removed successfully" });
//         } else {
//             res.status(404).json({ message: "Friend not found or already removed" });
//         }
//     } catch (error) {
//         console.error("Error removing friend:", error.message, error.stack);
//         res.status(500).json({ message: "Internal Server Error", error: error.message });
//     }
// });

// app.delete('/friend-request/remove', async (req, res) => {
//   try {
//       const userId = new ObjectId("6766789c9c01a2601d81bc57");
//       const friendIdsToRemove = [
//           new ObjectId("6777ee083fa34e323f416baa"),
//           new ObjectId("6777ecf73fa34e323f416b2f"),
//           new ObjectId("6777ebe63fa34e323f416a95"),
//           new ObjectId("6777ea733fa34e323f4169f5")
//       ]; // Replace with your array of friend IDs

//       const result = await UserModel.updateOne(
//           { _id: userId },
//           { $pull: { groups: { $in: friendIdsToRemove } } } // Use $in to match any of the IDs in the array
//       );

//       if (result.modifiedCount > 0) {
//           res.status(200).json({ message: "Friends removed successfully" });
//       } else {
//           res.status(404).json({ message: "No friends found or already removed" });
//       }
//   } catch (error) {
//       console.error("Error removing friends:", error.message, error.stack);
//       res.status(500).json({ message: "Internal Server Error", error: error.message });
//   }
// });

// app.delete('/delete-all-messages', async (req, res) => {
//   try {
//       // Delete all messages
//       const result = await MessageModel.deleteMany({});

//       // Respond with the number of deleted documents
//       return res.status(200).json({
//           success: true,
//           message: `${result.deletedCount} messages deleted successfully`,
//       });
//   } catch (error) {
//       console.error("Error deleting all messages:", error);
//       res.status(500).json({ success: false, message: "Internal server error" });
//   }
// });
