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
import multer from "multer";
import axios from "axios"
const app = express()
const port = 3000

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


app.listen(port,'0.0.0.0',() => {
    console.log(`Example app listening on port ${port}`)
});
app.use("/files", express.static("D:/CHAT APP/Backend/files"));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

//API's

// Registering User
app.post('/create_user',(req, res)=>{
    const {user_name, email, password} = req.body;

    const user = new UserModel({user_name, email, password});
    user.save().then(()=>{
        res.status(200).json({ message: "User Account Created"})
    }).catch((err)=>{
        console.log("Failed to register the User", err);
        res.status(500).json({message:"Error registering your account"})
    })
})

const createToken = (userId) =>{
    const payload={
        userId:userId
    }

    const token = jsonwebtoken.sign(payload, "Q$r2K6W8n!jCW%Zk", {expiresIn: "1h"});

    return token;
}
// Login user
app.post('/user_login',(req, res)=>{
    const { email, password, expoPushToken} = req.body;
    console.log(req.body)
    if(!email || !password){
        return res.status(400).json({message: "Please enter both email and password"})
    }

    UserModel.findOne({email}).then((user)=>{
        if(!user){
            return res.status(404).json({message: "User Not Found"})
        }

        if(user.password !== password){
            return res.status(401).json({message: "Invalid Password"})
        }

        if (expoPushToken) {
            user.expoPushToken = expoPushToken;
            user.save();
        }


        const token= createToken(user.id);
        res.status(200).json({token})
    }).catch((error)=> {
        console.log("Error in finding the user", error);
        res.status(500).json({message: "Error in finding the user"})
    })
})

//retrive all users
app.get('/all_users/:userId', async (req, res) => {
    const currentUser = req.params.userId;

    try {
        // Fetch the current user to get their friends array
        const user = await UserModel.findById(currentUser);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Extract friend IDs to exclude
        const friendsIds = user.friends.map(friend => friend.toString());

        // Find users excluding the current user and their friends
        const users = await UserModel.find({
            _id: { $nin: [...friendsIds, currentUser] }
        });

        res.status(200).json({ users });
    } catch (error) {
        console.log("Error in finding the users", error);
        res.status(500).json({ message: "Error in finding the users" });
    }
});

// app.get('/all_users/:userId',(req, res)=>{

//     const currentUser = req.params.userId;

//     UserModel.find({_id:{$ne: currentUser}}).then((users)=>{
//         res.status(200).json({users})
//     }).catch((error)=> {
//         console.log("Error in finding the users", error);
//         res.status(500).json({message: "Error in finding the users"})
//     })
// })

//send friend request
app.post('/friend-request/',async (req, res)=>{

    const {currentUserId, selectedUserId} = req.body;

    try {
        await UserModel.findByIdAndUpdate(selectedUserId,{
            $push: {friendRequests : currentUserId}
        });

        await UserModel.findByIdAndUpdate(currentUserId,{
            $push: {sentFriendRequests : selectedUserId}
        });

        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(500);
    }
})

//Get friend requests api
app.get('/get-friend-request/:userId',async (req, res)=>{

    try {
        const {userId} = req.params;
        const users = await UserModel.findById(userId).populate("friendRequests","user_name email") .lean()       

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

        sender.friends.push(recepientId)
        recepient.friends.push(senderId)

        recepient.friendRequests = recepient.friendRequests.filter((request)=> request.toString() !== senderId.toString())
        sender.sentFriendRequests = sender.sentFriendRequests.filter((request)=> request.toString() !== recepientId.toString())

        await sender.save();
        await recepient.save();
        
        res.status(200).json({message:"Friend request accepted"})
    } catch (error) {
        res.sendStatus(500);
    }
})

//Get all friends to chat
app.get('/get-all-friends/:userId',async (req, res)=>{
    try {
        const {userId} = req.params;
        const users = await UserModel.findById(userId).populate("friends","user_name email") .lean()       

        const friends = users.friends;
        res.json(friends)

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
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|mp4|mov/; // Add video formats
        const extName = fileTypes.test(file.mimetype);
        if (extName) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed!'), false);
        }
    },
});


app.post('/messages',upload.single("file"),async (req, res)=>{
    try {
        const {senderId, recepientId, messageType, message, duration, videoName} = req.body;
        console.log(req.body)
        const newMessage = new MessageModel({
            senderId,
            recepientId,
            messageType,
            message,
            timeStamp:new Date(),
            imageUrl:messageType ==='image' ? req.file?.path : null,
            videoUrl: messageType === 'video' ? req.file?.path.replace(/\\/g, '/') : null,
            duration :messageType === 'video' ? Math.floor(duration / 1000) : null,
            videoName : messageType === 'video' ? videoName : null
        })
        await newMessage.save();

        const recipient = await UserModel.findById(recepientId);
        if (!recipient || !recipient.expoPushToken) {
            return res.status(404).json({ message: "Recipient not found or push token missing." });
        }
        const sender = await UserModel.findById(senderId);
        const userName = sender.user_name;
        const notificationData = {
            to: recipient.expoPushToken, // Push token of the recipient
            sound: 'default',
            title: `${messageType} Message from ${sender.user_name}`,
            body: messageType === 'text' ? message : `You received a ${messageType}.`,
            data: { senderId, recepientId, messageType, userName}, // Optional custom data
        };

        // Send push notification using Expo Push Notification service
        await axios.post('https://exp.host/--/api/v2/push/send', notificationData, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        res.status(200).json({message:"Message sent successfully and notification delivered."})

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
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
        }).populate("senderId", "_id user_name");
        res.json({message})

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

// app.get('/user/:userId',async (req, res)=>{
//     try {
//         const {userId} = req.params;
//         const recepientId = await UserModel.findById(userId) 
//         res.json(recepientId);

//     } catch (error) {
//         console.log(error)
//         res.sendStatus(500);
//     }
// })


//delete messages
app.post('/deleteMessages/',async (req, res)=>{
    try {
        const {messages} = req.body;
        console.log(req.body)
        if(!Array.isArray(messages) || messages.length === 0){
            return res.status(400).json({message: "invalid req body"});
        }
        await MessageModel.deleteMany({_id:{$in: messages}})       

        res.json({messages : "Message deleted successfully"})

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

app.get('/friend-requests/sent/:userId',async (req, res)=>{

    const {currentUserId} = req.params;

    try {
        const user = await UserModel.findById(currentUserId).populate("sentFriendRequests","user_name email").lean();
        const sentFriendRequests = user.sentFriendRequests;
        
        res.json(sentFriendRequests);
    } catch (error) {
        res.sendStatus(500);
    }
})

app.get('/friends/:userId',async (req, res)=>{

    const {currentUserId} = req.params;

    try {
        UserModel.findById(currentUserId).populate("friends").then((user)=>{
            if(!user){
                res.status(404).json({message: "user not found"});
            }

            const friendIds= user.friends.map((friend)=> friend._id);
            res.status(200).json(friendIds);
        });
    } catch (error) {
        res.sendStatus(500);
    }
})