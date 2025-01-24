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
    groups: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Group"  // Reference to the Group model
        }
    ],
    expoPushToken:String,
    friendRequests:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
        }

    ],
    friends:[
        {
        friendsList:[
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            }
        ],
        deletedChats: [
            {
              type: mongoose.Schema.Types.ObjectId,
            }
          ]}
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