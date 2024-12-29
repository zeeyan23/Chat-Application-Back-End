import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    senderId:{
        
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
        
    },
    recepientId:{
        
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
        
    },
    messageType:{
        type: String,
        enum:["text", "image", "video", "audio","pdf", "docx", "pptx", "xlsx", "zip"]
    },
    message:String,
    imageUrl:String,
    videoUrl: String, 
    videoName: String,
    duration: Number,
    documentUrl:String,
    fileName: String,
    timeStamp:{
        type: Date,
        default: Date.now
    },
    created_date: {
        type: Date,
        default: Date.now
      },
      modified_date: {
        type: Date,
        default: Date.now
      },
      replyMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
        default: null,
      },
      starredBy:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
      }],
      clearedBy:[{
        type:mongoose.Schema.Types.ObjectId
      }]


});

messageSchema.pre('save', function(next) {
    this.modified_date = new Date();
    next();
  });
  

const MessageModel = mongoose.model("Message", messageSchema);
export default MessageModel;