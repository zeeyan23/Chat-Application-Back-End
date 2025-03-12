import express from "express";

import UserModel from "../model/user.model.js";
import GroupModel from "../model/group.model.js";
import { getSocketInstance } from "../socket.js";

const router = express.Router();

//send friend request
router.post('/friend-request/',async (req, res)=>{

    const {currentUserId, selectedUserId} = req.body;
    try {
        await UserModel.findByIdAndUpdate(selectedUserId,{
            $addToSet: {friendRequests : currentUserId}
        });

        await UserModel.findByIdAndUpdate(currentUserId,{
            $addToSet: {sentFriendRequests : selectedUserId}
        });

        const sender = await UserModel.findById(currentUserId).select("user_name");
        // const recipientSocketId = connectedUsers[selectedUserId];
        // console.log("recipientSocketId", recipientSocketId)
        console.log("",selectedUserId)
        const io = getSocketInstance();
            io.to(selectedUserId).emit("friendRequestReceived", {
                senderId: currentUserId,
                senderName: sender.user_name,
            });
        

        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(500);
    }
})

//Get friend requests api
router.get('/get-friend-request/:userId',async (req, res)=>{

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
router.post('/accept-friend-request/accept',async (req, res)=>{

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

    
        const io = getSocketInstance();
            io.to(senderId).emit('friendRequestAccepted', {
                userId: recepientId,
            });
        

            io.to(recepientId).emit('friendRequestAccepted', {
                userId: senderId,
            });
        
        res.status(200).json({message:"Friend request accepted"})
    } catch (error) {
        res.sendStatus(500);
    }
})

router.get('/has-friends/:userId',async (req, res)=>{
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
router.get('/get-all-friends/:userId',async (req, res)=>{
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


router.get("/get_chat_info/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    let userInfo = await GroupModel.findById(id)
      .populate("groupMembers", "_id user_name email image")
      .populate("groupAdmin", "_id user_name email image");

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

router.get("/get_group_members/:groupId/:userId", async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    
    let userInfo = await GroupModel.findById(groupId)
      .populate("groupMembers", "_id user_name email image")
      .populate("groupAdmin", "_id user_name email image");

      if (!userInfo) {
        userInfo = await UserModel.findById(userId).select("_id user_name email image");
      }

      if (!userInfo) {
        return res.status(404).json({ error: "User or group not found" });
      }
  
      if (userInfo.groupMembers) {
        userInfo.groupMembers = userInfo.groupMembers.filter(
          (member) => member._id.toString() !== userId
        );
      }
  
      if (userInfo.groupAdmin && userInfo.groupAdmin._id.toString() === userId) {
        userInfo.groupAdmin = null; // or exclude it completely
      }

      res.status(200).json(userInfo);

  } catch (error) {
    console.log("Error:", error);
    res.status(500).json({ error: "Failed to fetch group messages" });
  }
});

router.get('/friend-requests/sent/:userId',async (req, res)=>{

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

router.get('/friend-requests/received/:userId',async (req, res)=>{

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

router.get('/friends/:userId',async (req, res)=>{

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

export default router;