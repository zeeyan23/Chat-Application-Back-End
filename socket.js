// socket.js
import { Server } from "socket.io";
import UserModel from "./model/user.model.js";
import axios from "axios"
let io;

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

    const connectedUsers = {};

    io.on('connection', (socket) => {
    console.log("user connected", socket.id)
    socket.on("join", async(userId) => {
        socket.join(userId);
        connectedUsers[userId] = socket.id;
        console.log(`${userId} connected with socket ID: ${socket.id}`);
    });

    socket.on("send_message", (data) => {
        if(data.isGroupChat){
        io.to(data.groupId).emit("receive_message", data);
        }else{
        io.to(data.receiverId).emit("receive_message", data);
        }
        socket.broadcast.emit("update_chat", data);
    });

    //voice call
    socket.on("voice_calling", async(data) => {
        
        const callerInfo = await UserModel.findById(data.callerId).select("user_name image");
        const calleeInfo = await UserModel.findById(data.calleeId).select("user_name image");

        const callee = await UserModel.findById(data.calleeId);
        const pushToken = callee.expoPushToken;
        
        const message = {
        to: pushToken,
        sound: "default",
        title: "Incoming Call",
        body: `${callerInfo.user_name} is calling you!`,
        // data: {
        //     callerId: callerInfo._id,
        //     callerName: callerInfo.user_name,
        // },
        data: {
            screen: `chat_application://VoiceScreen/${callerInfo._id}/${callerInfo.user_name}`
        },
        };

        await axios.post('https://exp.host/--/api/v2/push/send', message, {
        headers: {
            'Content-Type': 'application/json',
        },
        });


        io.to(data.calleeId).emit("incoming_voice_call", {
        callerId: data.callerId,
        calleeId: data.calleeId,
        isCaller: data.isCaller,
        callerInfo,
        calleeInfo,
        isCaller: false,
        isGroup: false,
        });
    });

    socket.on("voice_call_accepted",async (data) => {
        const calleeInfo = await UserModel.findById(data.calleeId).select("user_name image");
        const callerInfo = await UserModel.findById(data.callerId).select("user_name image");
        io.emit("voice_call_approved", {
        callerId: data.callerId,
        calleeId: data.calleeId,
        isCaller: true,
        calleeInfo,
        callerInfo
        });
    });

    socket.on("decline_voice_call", (data) => {
        io.to(data.calleeId).emit("voice_call_declined", data);
    });

    socket.on("leave_group_voice_call", (data) => {

        if(data.isCaller){
        
        const { userId, participants, isCaller } = data;
        const participantIds = participants.map((p) => p.id || p);
        participantIds.forEach((participantId) => {
            let message;
    
            if (String(userId) === String(participantId)) {
            message = "You ended the call.";
            } else {
            message = "The host has ended the call.";
            }
    
            io.to(participantId).emit("group_call_ended", { message });
            console.log(`Emitting to ${participantId}:`, message);
        });
        }else{
        const memberIdToRemove = String(data.memberId).trim();
        const updatedParticipants = data.participants.filter(member => member.id !== memberIdToRemove);
        io.to(data.memberId).emit("group_call_ended", { message: "You declined the call"});
        }
    });

    socket.on("leave_group_video_call", (data) => {

        if(data.isCaller){
        
        const { userId, participants, isCaller } = data;
        const participantIds = participants.map((p) => p.id || p);
        participantIds.forEach((participantId) => {
            let message;
    
            if (String(userId) === String(participantId)) {
            message = "You ended the call.";
            } else {
            message = "The host has ended the call.";
            }
    
            io.to(participantId).emit("group_video_call_ended", { message });
            console.log(`Emitting to ${participantId}:`, message);
        });
        }else{
        const memberIdToRemove = String(data.memberId).trim();
        const updatedParticipants = data.participants.filter(member => member.id !== memberIdToRemove);
        io.to(data.memberId).emit("group_video_call_ended", { message: "You declined the call"});
        }
    });

    socket.on("leave_voice_call", (data) => {
        io.to(data.calleeId).emit("call_ended", { message: "User has left the call" });
        io.to(data.callerId).emit("call_ended", { message: "User has left the call" });
    });


    socket.on("group_voice_calling", async (data) => {
        // console.log("data", data);
        try {
        const callerInfo = await UserModel.findById(data.callerId).select("user_name image");
        if (!callerInfo) {
            console.error("Caller not found");
            return;
        }
        
        const participants = Array.from(new Set(data.participants));
        const participantsInfo = await UserModel.find({
            _id: { $in: data.participants },
        }).select("user_name image");

        const participantDetails = participantsInfo.map((user) => ({
            id: user._id.toString(),
            userName: user.user_name,
            userImage: user.image,
        }));

        // Get all participant details in one query
        const users = await UserModel.find({ _id: { $in: participants } }).select("expoPushToken");
        
        // Broadcast to all members except the caller
        await Promise.all(
            participants.map(async (memberId) => {
            if(memberId != data.callerId){
                io.to(memberId).emit("incoming_group_voice_call", {
                groupId: data.groupId,
                participants: participantDetails,
                isCaller: data.isCaller,
                callerId: data.callerId,
                callerName: callerInfo.user_name,
                callerImage: callerInfo.image,
                memberId: memberId
                });
        
                // Send push notification if token exists
                const callee = users.find((user) => user._id.toString() === memberId.toString());
                if (callee?.expoPushToken) {
                const message = {
                    to: callee.expoPushToken,
                    sound: "default",
                    title: "Incoming Group Call",
                    body: `${callerInfo.user_name} is calling you!`,
                    // data: {
                    // callerId: callerInfo._id,
                    // callerName: callerInfo.user_name,
                    // groupId: data.groupId,
                    // },
                    data: {
                        screen: `chat_application://VoiceScreen/${callerInfo._id}/${callerInfo.user_name}/${data.groupId}`
                    },
                };
        
                await axios.post("https://exp.host/--/api/v2/push/send", message, {
                    headers: { "Content-Type": "application/json" },
                });
                }
            }
            
            })
        );
        } catch (error) {
        console.error("Error handling group voice call:", error);
        }
    });
    
    
    socket.on("group_video_calling", async (data) => {
        try {
        const callerInfo = await UserModel.findById(data.callerId).select("user_name image");
        if (!callerInfo) {
            console.error("Caller not found");
            return;
        }
        
        const participants = Array.from(new Set(data.participants));
        const participantsInfo = await UserModel.find({
            _id: { $in: data.participants },
        }).select("user_name image");

        const participantDetails = participantsInfo.map((user) => ({
            id: user._id.toString(),
            userName: user.user_name,
            userImage: user.image,
        }));

        // Get all participant details in one query
        const users = await UserModel.find({ _id: { $in: participants } }).select("expoPushToken");
        
        // Broadcast to all members except the caller
        await Promise.all(
            participants.map(async (memberId) => {
            if(memberId != data.callerId){
                io.to(memberId).emit("incoming_group_video_call", {
                groupId: data.groupId,
                participants: participantDetails,
                isCaller: data.isCaller,
                callerId: data.callerId,
                callerName: callerInfo.user_name,
                callerImage: callerInfo.image,
                memberId: memberId
                });
        
                // Send push notification if token exists
                const callee = users.find((user) => user._id.toString() === memberId.toString());
                if (callee?.expoPushToken) {
                const message = {
                    to: callee.expoPushToken,
                    sound: "default",
                    title: "Incoming Group Call",
                    body: `${callerInfo.user_name} is calling you!`,
                    // data: {
                    // callerId: callerInfo._id,
                    // callerName: callerInfo.user_name,
                    // groupId: data.groupId,
                    // },
                    data: {
                        screen: `chat_application://VideoScreen/${callerInfo._id}/${callerInfo.user_name}/${data.groupId}`
                    },
                };
        
                await axios.post("https://exp.host/--/api/v2/push/send", message, {
                    headers: { "Content-Type": "application/json" },
                });
                }
            }
            
            })
        );
        } catch (error) {
        console.error("Error handling group voice call:", error);
        }
    });

    socket.on("group_voice_call_accepted", async (data) => {
        try {
        const participantIds = data.participants
            .filter((participant) => participant && participant.id) // Remove invalid entries
            .map((participant) => participant.id);
    
        const participantsInfo = await UserModel.find({
            _id: { $in: participantIds },
        }).select("user_name image");
    
        // Map to the required format for emitting back
        const participantDetails = participantsInfo.map((user) => ({
            id: user._id.toString(),
            userName: user.user_name,
            userImage: user.image,
        }));
    
        // Emit the approved event back to the caller
        io.to(data.callerId).emit("group_voice_call_approved", {
            channelId: data.groupId, // Agora channel (groupId as channelId)
            participants: participantDetails, // List of valid users
        });
        } catch (error) {
        console.error("Error in group_voice_call_accepted:", error);
        }
    });
    
    socket.on("group_video_call_accepted", async (data) => {
        try {
        const participantIds = data.participants
            .filter((participant) => participant && participant.id) // Remove invalid entries
            .map((participant) => participant.id);
    
        const participantsInfo = await UserModel.find({
            _id: { $in: participantIds },
        }).select("user_name image");
    
        // Map to the required format for emitting back
        const participantDetails = participantsInfo.map((user) => ({
            id: user._id.toString(),
            userName: user.user_name,
            userImage: user.image,
        }));
    
        // Emit the approved event back to the caller
        io.to(data.callerId).emit("group_video_call_approved", {
            channelId: data.groupId, // Agora channel (groupId as channelId)
            participants: participantDetails, // List of valid users
        });
        } catch (error) {
        console.error("Error in group_video_call_accepted:", error);
        }
    });
    

    socket.on("decline_group_voice_call", async(data) => {
        if(data.isCaller){
        const { userId, participants, isCaller } = data;

        participants.forEach((participantId) => {
            let message;

            // If the current participant is the one who declined the call
            if (userId === participantId) {
                message = "You ended the call.";
            } else {
                // If the caller ends the call, notify others with a different message
                message = isCaller
                    ? "The host has ended the call."
                    : "A participant has left the call.";
            }

            // Emit the message to each participant's socket ID
            io.to(participantId).emit("group_voice_call_declined", { message });
        });
        }else{
        const memberIdToRemove = String(data.memberId).trim();
        const updatedParticipants = data.participants.filter(member => member.id !== memberIdToRemove);
        io.to(data.memberId).emit("group_voice_call_declined", { message: "You declined the call"});
        }
        
    });

    socket.on("decline_group_video_call", async(data) => {
        if(data.isCaller){
        const { userId, participants, isCaller } = data;

        participants.forEach((participantId) => {
            let message;

            // If the current participant is the one who declined the call
            if (userId === participantId) {
                message = "You ended the call.";
            } else {
                // If the caller ends the call, notify others with a different message
                message = isCaller
                    ? "The host has ended the call."
                    : "A participant has left the call.";
            }

            // Emit the message to each participant's socket ID
            io.to(participantId).emit("group_video_call_declined", { message });
        });
        }else{
        const memberIdToRemove = String(data.memberId).trim();
        const updatedParticipants = data.participants.filter(member => member.id !== memberIdToRemove);
        io.to(data.memberId).emit("group_video_call_declined", { message: "You declined the call"});
        }
        
    });


    //video call
    socket.on("video_calling", async(data) => {
        const callerInfo = await UserModel.findById(data.callerId).select("user_name image");
        const calleeInfo = await UserModel.findById(data.calleeId).select("user_name image");

        const callee = await UserModel.findById(data.calleeId);
        const pushToken = callee.expoPushToken;
        
        const message = {
        to: pushToken,
        sound: "default",
        title: "Incoming Call",
        body: `${callerInfo.user_name} is calling you!`,
        // data: {
        //     callerId: callerInfo._id,
        //     callerName: callerInfo.user_name,
        // },
        data: {
            screen: `chat_application://VideoScreen/${callerInfo._id}/${callerInfo.user_name}`
        },
        };

        await axios.post('https://exp.host/--/api/v2/push/send', message, {
        headers: {
            'Content-Type': 'application/json',
        },
        });


        io.to(data.calleeId).emit("incoming_video_call", {
        callerId: data.callerId,
        calleeId: data.calleeId,
        isCaller: data.isCaller,
        callerInfo,
        calleeInfo,
        isCaller: false,
        isGroup: false,
        });
    });

    socket.on("video_call_accepted", (data) => {
        io.emit("video_call_approved", { channelId: data.callerId });
    });

    socket.on("decline_video_call", (data) => {
        io.to(data.calleeId).emit("video_call_declined", data);
    });

    socket.on("leave_video_call", (data) => {
        console.log(data)
        io.to(data.calleeId).emit("video_call_ended", { message: "User has left the call" });
        io.to(data.callerId).emit("video_call_ended", { message: "User has left the call" });
    });

    socket.on("disconnect", async(reason) => {
        console.log("User disconnected:", socket.id, "Reason:", reason);
    });
    });
};

export const getSocketInstance = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
