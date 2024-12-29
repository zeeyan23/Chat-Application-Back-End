import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    user_name:{
        type: String,
        required:true
    },
    email:{
        type: String,
        required:true,
        unique: true
    },
    password:{
        type: String,
        required:true
    },
    image:{
        type:String
    },
    expoPushToken:String,
    friendRequests:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
        }

    ],
    friends:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
        }
    ],
    sentFriendRequests:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
        }

    ],
    pinnedChats:[{
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
    }],
    created_date: {
        type: Date,
        default: Date.now
    },
    modified_date: {
        type: Date,
        default: Date.now
    }

});
userSchema.pre('save', function(next) {
    this.modified_date = new Date();
    next();
  });
  

const UserModel = mongoose.model("User", userSchema);
export default UserModel;