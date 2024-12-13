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
        enum:["text", "image", "video", "audio"]
    },
    message:String,
    imageUrl:String,
    videoUrl: String, 
    videoName: String,
    duration: Number,
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
      }

});

messageSchema.pre('save', function(next) {
    this.modified_date = new Date();
    next();
  });
  

const MessageModel = mongoose.model("Message", messageSchema);
export default MessageModel;