import express from "express";
import UserModel from "../model/user.model.js";
import { getSocketInstance } from "../socket.js";
import MessageModel from "../model/message.model.js";

const router = express.Router();

router.post('/clear-chat', async (req, res) => {
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

  router.patch("/deleteChat", async (req, res) => {
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
  router.patch("/updatePinnedChats", async (req, res) => {
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
      const io = getSocketInstance();
      
        io.to(userId).emit("pinnedChatsUpdated", updatedUser.pinnedChats);
      res.status(200).json({
        message: "Pinned chats updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Error updating pinned chats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  router.get('/get-pinned-chats/:id/:userId/', async (req, res) => {
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

  router.delete('/unPinChats/:id/:userId', async (req, res) => {
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
      const io = getSocketInstance();
      io.to(userId).emit("pinnedChatsUpdated", user.pinnedChats);
      res.status(200).json({ message: "Pinned message removed successfully." });
    } catch (error) {
        console.error("Error removing pinned message:", error);
        res.status(500).json({ message: "Internal server error." });
    }
  });

  router.delete('/remove_chat_from_deleted_chat', async (req, res) => { 
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

export default router;