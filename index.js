import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import passport from "passport";
import LocalStratergy from "passport-local"
import cors from "cors";
import dotenv from "dotenv"
import { createServer } from 'node:http';
import { ObjectId } from 'mongodb';
import path from "path"
import userRoutes from './routes/userRoutes.js';
import friendRoutes from './routes/friendRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { initializeSocket } from "./socket.js";
const { RtcTokenBuilder, RtcRole } = await import("agora-access-token");
import Agora from 'agora-access-token'

const app = express()
const server = createServer(app);
initializeSocket(server);
app.use(bodyParser.urlencoded({extended:false}));
app.use(express.json({ limit: '100mb' }));
app.use(cors());
app.use(bodyParser.json());
app.use(passport.initialize())
app.use("/files", express.static(path.resolve("D:/CHAT APP/Backend/files")));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

dotenv.config()
const PORT= process.env.PORT || 3000;
const uri= process.env.MONGODB_URI;

const AGORA_APP_VIDEO_ID = process.env.AGORA_APP_VIDEO_ID;
const AGORA_APP_VIDEO_CERTIFICATE = process.env.AGORA_APP_VIDEO_CERTIFICATE;

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;
const expirationTimeInSeconds = 3600; // 24 hours

try{
  mongoose.connect(uri);
  console.log("connected to MongoDB");
}catch(err){
  console.log("Error connection", err);
}

app.use("/", adminRoutes);
app.use("/user", userRoutes);
app.use("/friend", friendRoutes);
app.use("/message", messageRoutes);
app.use("/chat", chatRoutes);
app.use("/group", groupRoutes);

const generateAgoraToken = (channelName, uid) => {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  // Generate RTC token for voice/video call
  return RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    channelName,
    uid,
    Agora.RtcRole.PUBLISHER, // Role: PUBLISHER (Host) or SUBSCRIBER (Audience)
    privilegeExpiredTs
  );
};

app.get("/generate_voice_token", (req, res) => {
  const { channelName, uid } = req.query;

  if (!channelName || !uid) {
    return res.status(400).json({ error: "Missing channelName or uid" });
  }

  const token = generateAgoraToken(channelName, parseInt(uid));
  console.log("token from backend", token)
  return res.json({ token });
});

const generateAgoraVideoToken = (channelName, uid) => {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  // Generate RTC token for voice/video call
  return RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_VIDEO_ID,
    AGORA_APP_VIDEO_CERTIFICATE,
    channelName,
    uid,
    Agora.RtcRole.PUBLISHER, // Role: PUBLISHER (Host) or SUBSCRIBER (Audience)
    privilegeExpiredTs
  );
};

app.get("/generate_video_token", (req, res) => {
  const { channelName, uid } = req.query;

  if (!channelName || !uid) {
    return res.status(400).json({ error: "Missing channelName or uid" });
  }

  const token = generateAgoraVideoToken(channelName, parseInt(uid));
  console.log("token from backend", token)
  return res.json({ token });
});

server.listen(3000, () => {
  console.log('server running');
});