import mongoose from "mongoose";

const groupSchema = new mongoose.Schema({
    groupName:{
        type: String,
    },
    groupIcon:{
        type: String,
    },
    groupMembers:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
        }

    ],
    groupAdmin:{
            
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
            
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
groupSchema.pre('save', function(next) {
    this.modified_date = new Date();
    next();
  });
  

const GroupModel = mongoose.model("Group", groupSchema);
export default GroupModel;