import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
    participant:{
            
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
            
        },
    other_participant:{
            
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
            
        },
    
    messageShouldDisappear: {
        type: Boolean,
        default: false, 
    },
    messageDisappearTime: {
        type: String,
        default: "Off",
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
chatSchema.pre('save', function(next) {
    this.modified_date = new Date();
    next();
  });
  

const ChatSettings = mongoose.model("ChatSettings", chatSchema);
export default ChatSettings;