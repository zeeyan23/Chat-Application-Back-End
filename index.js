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

server.listen(3000, () => {
  console.log('server running');
});